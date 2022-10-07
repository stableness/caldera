import {

    readable,
    writable,

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





export type Handle = Awaited<ReturnType<typeof on_request>>;

async function on_request ({ auth }: Opts) {

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

        tunnel (port, hostname) (req);

    };

}





function tunnel (port: number, hostname: string) {

    return async function ({ conn: res }: ServerRequest) {

        try {

            const req = await Deno.connect({ hostname, port });

            await Promise.all([
                res.write(established),
                readable(req).pipeTo(writable(res)),
                readable(res).pipeTo(writable(req)),
            ]);

        } catch (e) {

            if (ignores(e) === true) {
                return;
            }

            console.error(e);

        }

    };

}





const verify = pre_verify({});

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





export function ignores (e: Error) {

    return [

        Deno.errors.BadResource,
        Deno.errors.BrokenPipe,
        Deno.errors.ConnectionReset,

    ].some(clazz => e instanceof clazz);

}





const established = new TextEncoder().encode('HTTP/1.0 200\r\n\r\n');

const auth_failure: Response = {
    status: 407,
    statusText: 'Proxy Authentication Required',
    headers: new Headers({ 'Proxy-Authenticate': 'proxy auth' }),
};





export function port_normalize ({ port, protocol }: URL) {
    return +port || (protocol === 'http:' ? 80 : 443);
}





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





export const port_verify = safe_int({ min: 0, max: 65535 });





const tap_catch = pre_tap_catch(console.error);

export function pre_tap_catch (error: typeof console.error) {

    return function pre_tap_catch (err?: Error) {
        error(err?.cause ?? (err?.message || err?.name));
        throw err;
    }

}

