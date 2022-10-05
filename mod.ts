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

    return Promise.allSettled([
        serve_http(opts, handle),
        serve_https(opts, handle),
    ]);

}





function serve_http (opts: Opts, handle: Handle) {

    const port = port_verify(opts.port?.http) ?? 0;

    if (port < 1) {
        return Promise.reject(new Error('no http port'));
    }

    console.info(`http [${ port }]`);

    return listenAndServe({ port }, handle).catch(tap_catch);

}





function serve_https (opts: Opts, handle: Handle) {

    const port = port_verify(opts.port?.https) ?? 0;
    const { crt: certFile = '', key: keyFile = '' } = opts;

    if (port < 1) {
        return Promise.reject(new Error('no https port'));
    }

    if (certFile === '' || keyFile === '') {
        return Promise.reject(new Error('no cert or key file'));
    }

    console.info(`https [${ port }]`);

    return listenAndServeTLS({ port, certFile, keyFile }, handle).catch(tap_catch);

}





type Handle = Awaited<ReturnType<typeof on_request>>;

async function on_request ({ auth }: Opts) {

    const check = await verify(auth);

    return function (req: ServerRequest) {

        if (req.method !== 'CONNECT') {
            return req.respond({ status: 204 });
        }

        if (check && check(req.headers) === false) {
            return req.respond(auth_failure);
        }

        const url = new URL(`http://${ req.url }`);

        const { hostname } = url;
        const port = port_normalize(url);

        return tunnel (port, hostname) (req);

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





const verify = pre_verify(console.warn, Deno.readTextFile);

export function pre_verify (
        warn: typeof console.warn,
        read_file: typeof Deno.readTextFile,
) {

    return async function (path?: string | URL) {

        if (path == null || (typeof path === 'string' && path.trim() === '')) {
            return warn('no authorization required');
        }

        try {

            const file = await read_file(path);

            const store = new Set(Object
                .entries(JSON.parse(file))
                .map(([ user, pass ]) => btoa(user + ':' + pass))
                .map(data => 'Basic ' + data)
            );

            if (store.size < 1) {
                throw new Error('empty auth file');
            }

            return function (headers: Headers) {
                const pa = headers.get('proxy-authorization');
                return pa != null && store.has(pa);
            };

        } catch (e: unknown) {

            return e instanceof Error
                ? warn(path, '<-', e.cause ?? e.message)
                : warn('fail to read auth file')
            ;

        }

    };

}





function ignores (e: Error) {

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

