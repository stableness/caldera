import {

    readable,
    writable,

    deadline,
    abortablePromise,

    listenAndServe,
    listenAndServeTLS,

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





export async function main (opts: Opts) {

    const handle = await on_request(opts);

    const [ http, https ] = await Promise.allSettled([
        serve_http(opts, handle),
        serve_https(opts, handle),
    ]);

    if (http.status === 'rejected' && https.status === 'rejected') {

        const cause = [
            '',
            http.reason,
            https.reason,
        ].join('\n');

        throw new Error('program exited', { cause });

    }

}





/* @internal */
export const pre_serves = ({
        serve = listenAndServe,
        serve_TLS = listenAndServeTLS,
        read_file = Deno.readTextFile,
        info = console.info,
}) => ({

    serve_http (opts: Opts, handle: Handle) {

        const port = port_verify(opts.port?.http) ?? 0;

        if (port < 1) {
            return Promise.reject(new Error('no http port'));
        }

        info(`http [${ port }]`);

        return serve({ port }, handle).catch(tap_catch);

    },

    async serve_https (opts: Opts, handle: Handle) {

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

        return serve_TLS({ port, key, cert }, handle).catch(tap_catch);

    },

});

const { serve_http, serve_https } = pre_serves({});





/* @internal */
export type Handle = Awaited<ReturnType<typeof on_request>>;

/* @internal */
export function pre_on_request({
    verify = verify_auth,
    tunnel = tunnel_to,
}) {

    return async function ({ auth, timeout }: Opts) {

        const check = auth && await verify(new URL(auth, import.meta.url));

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

type Duplex = Deno.Reader & Deno.Writer;
type Connect = (_: Deno.ConnectOptions) => Promise<Duplex>;

/* @internal */
export function pre_tunnel_to ({
        connect = Deno.connect as Connect,
        ignoring = ignores,
        head = established,
        error = console.error,
}) {

    return function (port: number, hostname: string) {

        return async function (res: Duplex, timeout = 0) {

            const ctrl = new AbortController();
            const { signal } = ctrl;

            try {

                const conn = connect({ hostname, port });

                const req = await (timeout > 0
                    ? deadline(conn, timeout)
                    : conn
                );

                await Promise.all([
                    abortablePromise(res.write(head), signal),
                    readable(req).pipeTo(writable(res), { signal }),
                    readable(res).pipeTo(writable(req), { signal }),
                ]);

            } catch (e: unknown) {

                ctrl.abort(e);

                if (ignoring(e) === false) {
                    error(e);
                }

            }

        };

    };

}





const verify_auth = pre_verify({});

/* @internal */
export function pre_verify ({
        read_file = Deno.readTextFile,
        auth_header = 'proxy-authorization',
        warn = console.warn,
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

        } catch (e: unknown) {

            const detail = e instanceof Error
                ? `: ${ e.cause ?? e.message }`
                : ''
            ;

            warn('fail to read auth file' + detail);

        }

    };

}





const on_request = pre_on_request({});





/* @internal */
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





/* @internal */
export function port_normalize ({ port, protocol }: URL) {
    return +port || (protocol === 'http:' ? 80 : 443);
}





/* @internal */
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





/* @internal */
export function try_catch <T> (fn: () => T): T | Error {
    try {
        return fn();
    } catch (e: unknown) {
        return e instanceof Error ? e : new Error('unknown', { cause: e });
    }
}





/* @internal */
export const port_verify = safe_int({ min: 0, max: 65535 });





const tap_catch = pre_tap_catch(console.error);

/* @internal */
export function pre_tap_catch (error: typeof console.error) {

    return function pre_tap_catch (err?: Error) {
        error(err?.cause ?? (err?.message || err?.name));
        throw err;
    }

}

