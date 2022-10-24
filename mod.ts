import {

    deadline,
    abortablePromise,
    abortableAsyncIterable,
    readableStreamFromIterable,
    MuxAsyncIterator,

    serve,
    serveTLS,

    resolve as toAbsolute,
    toFileUrl,

    type Server,
    type Response,
    type ServerRequest,

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

    const fulfilled = services.filter(settling.fulfilled);

    try {

        const mux = new MuxAsyncIterator<ServerRequest>();

        for (const { value } of fulfilled) {
            mux.add(value);
        }

        const listener = catch_abortable(abortableAsyncIterable(mux, signal));

        for await (const conn of listener) {
            handle(conn);
        }

    } finally {

        for (const { value } of fulfilled) {
            try_close(value);
        }

    }

}





/** @internal */
export const pre_serves = ({
        http = serve,
        https = serveTLS,
        read_file = Deno.readTextFile,
        info = console.info,
}) => ({

    serve_http: (opts: Opts) => new Promise<Server>((resolve, reject) => {

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

        return function (req: ServerRequest): void {

            if (req.method !== 'CONNECT') {
                return void req.respond({ status: 204 });
            }

            if (check && check(req.headers) === false) {
                return void req.respond(auth_failure);
            }

            const url = new URL(`http://${ req.url }`);

            const { hostname } = url;
            const port = port_normalize(url);

            tunnel (port, hostname) (req.conn, timeout);

        };

    };

}





const established = new TextEncoder().encode('HTTP/1.0 200\r\n\r\n');

const tunnel_to = pre_tunnel_to({});

export type Conn = TransformStream<Uint8Array, Uint8Array> & Deno.Closer;

/** @internal */
export function pre_tunnel_to ({
        connect = Deno.connect as (_: Deno.ConnectOptions) => Promise<Conn>,
        ignoring = ignores,
        head = established,
        error = console.error,
}) {

    return function (port: number, hostname: string) {

        return async function (res: Conn, timeout = 0) {

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

                const all_readable = readableStreamFromIterable(
                    abortableAsyncIterable(
                        prepend(head, req.readable),
                        signal,
                    ),
                );

                const opts: PipeOptions = {
                    signal,
                    preventClose: true,
                };

                await Promise.all([

                    all_readable.pipeTo(res.writable, opts),
                    res.readable.pipeTo(req.writable, opts),

                ]).finally(() => {

                    try_close(req);

                });

            } catch (e: unknown) {

                if (ignoring(e) === false) {
                    error(e);
                }

            } finally {

                ctrl.abort();
                try_close(res);

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

    ].some(clazz => e instanceof clazz);

}





const auth_failure: Response = {
    status: 407,
    statusText: 'Proxy Authentication Required',
    headers: new Headers({ 'Proxy-Authenticate': 'proxy auth' }),
};





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





/** @internal */
export async function* catch_abortable <T> (iterable: Iterable<T> | AsyncIterable<T>) {

    try {

        yield* iterable;

    } catch (err: unknown) {

        if (err instanceof Error && err.name === 'AbortError') {
            return;
        }

        throw err;

    }

}





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

