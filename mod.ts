import {

    deadline,
    DeadlineError,
    abortablePromise,
    abortableAsyncIterable,
    readableStreamFromIterable,
    MuxAsyncIterator,

    resolve as toAbsolute,
    toFileUrl,

} from './deps.ts';





export type Opts = Partial<{
    auth: string,
    port: Partial<{
        http: number,
        https: number,
    }>,
    timeout: number,
    crt: string,
    key: string,
}>





export async function main (
        opts: Opts,
        { signal } = new AbortController() as { readonly signal: AbortSignal },
) {

    const handle = await on_request(opts);

    const services = await Promise.allSettled([
        serve_http(opts),
        serve_https(opts),
    ]);

    if (services.every(settling.rejected)) {

        const cause = [
            '',
            ...services.filter(settling.rejected).map(r => r.reason),
        ].join('\n');

        throw new Error('program exited', { cause });

    }

    const fulfilled = services.filter(settling.fulfilled).map(r => r.value);

    try {

        const graceful_abort = <T> (iterable: AsyncIterable<T>) => {
            return catch_abortable(abortableAsyncIterable(iterable, signal));
        };

        const mux = new MuxAsyncIterator<Deno.Conn>();

        fulfilled.forEach(it => mux.add(graceful_abort(it)));

        for await (const conn of mux) {

            const listener = graceful_abort(Deno.serveHttp(conn));

            for await (const event of catch_all(listener)) {
                handle(event).catch(ignores);
            }

        }

    } finally {

        fulfilled.forEach(try_close);

    }

}





/** @internal */
export const pre_serves = ({
        http = Deno.listen,
        https = Deno.listenTls,
        read_file = Deno.readTextFile,
        info = console.info,
}) => ({

    serve_http: (opts: Opts) => new Promise<Deno.Listener>((resolve, reject) => {

        const port = port_verify(opts.port?.http) ?? 0;

        if (port < 1) {
            return reject(new Error('no http port'));
        }

        info(`http [${ port }]`);

        resolve(http({ port }));

    }),

    async serve_https (opts: Opts) {

        const port = port_verify(opts.port?.https) ?? 0;

        if (port < 1) {
            throw new Error('no https port');
        }

        const { key: opts_key, crt: opts_cert } = opts;

        if (opts_key == null || opts_cert == null) {
            throw new Error('no key or cert file');
        }

        const key = await read_file(opts_key);
        const cert = await read_file(opts_cert);

        info(`https [${ port }]`);

        return https({ port, key, cert });

    },

});

const { serve_http, serve_https } = pre_serves({});





/** @internal */
export function pre_on_request({
        verify = verify_auth,
        tunnel = tunnel_to,
}) {

    return async function ({ auth, timeout }: Opts) {

        const check = auth && await verify(toFileUrl(toAbsolute(auth)));

        return function (event: Deno.RequestEvent) {

            const { request, respondWith } = event;

            if (request.method !== 'CONNECT') {
                return respondWith(new Response(null, { status: 204 }));
            }

            if (check && check(request.headers) === false) {
                return respondWith(auth_failure);
            }

            const url = new URL(request.url);

            const { hostname } = url;
            const port = port_normalize(url);

            return tunnel (port, hostname) (event, timeout);

        };

    };

}




const succeed = new Response(null, { status: 200 });

const tunnel_to = pre_tunnel_to({});

export type Conn = TransformStream<Uint8Array, Uint8Array> & Deno.Closer;

/** @internal */
export function pre_tunnel_to ({
        connect = Deno.connect as (_: Deno.ConnectOptions) => Promise<Conn>,
        upgrade = Deno.upgradeHttp,
        ignoring = ignores,
        established = succeed,
        error = console.error,
}) {

    return function (port: number, hostname: string) {

        return async function (event: Deno.RequestEvent, timeout = 0) {

            const ctrl = new AbortController();
            const { signal } = ctrl;

            try {

                const conn = abortablePromise(
                    connect({ hostname, port }),
                    signal,
                );

                const req = await (timeout > 0
                    ? deadline(conn, timeout)
                    : conn
                );

                const [ [ res, init ] ] = await Promise.all([
                    upgrade(event.request),
                    event.respondWith(established),
                ]);

                const all_readable = init.length < 1
                    ? res.readable
                    : readableStreamFromIterable(abortableAsyncIterable(
                        prepend(init, res.readable),
                        signal,
                      ))
                ;

                await Promise.all([

                    req.readable.pipeTo(res.writable, { signal }),
                    all_readable.pipeTo(req.writable, { signal }),

                ]).finally(() => {

                    try_close(req);
                    try_close(res);

                });

            } catch (e: unknown) {

                if (ignoring(e) === false) {
                    error(hostname, port, e);
                }

            } finally {

                ctrl.abort();

            }

        };

    };

}





const verify_auth = pre_verify({});

/** @internal */
export function pre_verify ({
        read_file = Deno.readTextFile,
        auth_header = 'proxy-authorization',
}) {

    return async function (input: string | URL) {

        try {

            const data = typeof input === 'string'
                ? input
                : await read_file(input)
            ;

            const store = new Set(Object
                .entries(JSON.parse(data))
                .map(([ user, pass ]) => btoa(user + ':' + pass))
                .map(data => 'Basic ' + data)
            );

            if (store.size < 1) {
                throw new Error('empty auth file');
            }

            return function (headers: Headers) {
                const pa = headers.get(auth_header);
                return pa != null && store.has(pa);
            };

        } catch (err: unknown) {

            const cause = err instanceof Error
                ? `: ${ err.cause ?? err.message }`
                : ''
            ;

            throw new Error('fail to read auth file', { cause });

        }

    };

}





const on_request = pre_on_request({});





/** @internal */
export function ignores (e: unknown) {

    return [

        Deno.errors.BadResource,
        Deno.errors.BrokenPipe,
        Deno.errors.ConnectionReset,
        Deno.errors.Interrupted,

        DeadlineError,

    ].some(clazz => e instanceof clazz);

}





const auth_failure = new Response(null, {
    status: 407,
    statusText: 'Proxy Authentication Required',
    headers: new Headers({ 'Proxy-Authenticate': 'proxy auth' }),
});





/** @internal */
export function port_normalize ({ port, protocol }: URL) {
    return +port || (protocol === 'http:' ? 80 : 443);
}





/** @internal */
export function safe_int ({
        min = Number.MIN_SAFE_INTEGER,
        max = Number.MAX_SAFE_INTEGER,
}) {

    return function (n: unknown): number | undefined {

        if (   typeof n === 'number'
            && Number.isSafeInteger(n)
            && n >= min
            && n <= max
        ) {
            return n;
        }

    };

}





const try_close = (fn: Deno.Closer) => try_catch(() => fn.close());





/** @internal */
export function try_catch <T> (fn: () => T): T | Error {
    try {
        return fn();
    } catch (e: unknown) {
        return e instanceof Error ? e : new Error('unknown', { cause: e });
    }
}





async function* prepend <T> (head: T, tail: AsyncIterable<T>) {
    yield head;
    yield* tail;
}





function catch_iterable_when (predicate: (_: unknown) => boolean) {

    return async function* <T> (iterable: Iterable<T> | AsyncIterable<T>) {

        try {

            yield* iterable;

        } catch (err: unknown) {

            if (predicate(err) === true) {
                return;
            }

            throw err;

        }

    };

}





/** @internal */
export const catch_abortable = catch_iterable_when((err): err is Error => {
    return err instanceof Error && err.name === 'AbortError';
});

/** @internal */
export const catch_all = catch_iterable_when(() => true);





/** @internal */
export const port_verify = safe_int({ min: 0, max: 65535 });





/** @internal */
export function pre_tap_catch (error: typeof console.error) {

    return function pre_tap_catch (err?: Error) {
        error(err?.cause ?? (err?.message || err?.name));
        throw err;
    }

}





const settling = {

    fulfilled <T> (
        result  : PromiseSettledResult<T>,
    ) : result is PromiseFulfilledResult<T> {
        return result.status === 'fulfilled';
    },

    rejected <T> (
        result  : PromiseSettledResult<T>,
    ) : result is PromiseRejectedResult {
        return result.status === 'rejected';
    },

} as const;

