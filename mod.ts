import {
    listenAndServe,
    listenAndServeTLS,
    type Response,
    type ServerRequest,
} from 'https://deno.land/std@0.117.0/http/server_legacy.ts';

import {
    readableStreamFromReader as readable,
    writableStreamFromWriter as writable,
} from 'https://deno.land/std@0.117.0/streams/mod.ts';





export type Opts = {
    auth?: string,
    port?: {
        http?: number,
        https?: number,
    },
    crt: string,
    key: string,
}





export function main (opts: Opts) {

    const handle = on_request(opts);

    return Promise.allSettled([
        serve_http(opts, handle),
        serve_https(opts, handle),
    ]);

}





function serve_http (opts: Opts, handle: Handle) {

    const port = opts.port?.http ?? 0;

    if (port < 1) {
        return Promise.reject(new Error('no http port'));
    }

    console.info(`http [${ port }]`);

    return listenAndServe({ port }, handle).catch(tap_catch);

}





function serve_https (opts: Opts, handle: Handle) {

    const port = opts.port?.https ?? 0;
    const { crt: certFile, key: keyFile } = opts;

    if (port < 1) {
        return Promise.reject(new Error('no https port'));
    }

    console.info(`https [${ port }]`);

    return listenAndServeTLS({ port, certFile, keyFile }, handle).catch(tap_catch);

}





type Handle = ReturnType<typeof on_request>;

function on_request ({ auth }: Opts) {

    const unauthorized = verify(auth);

    return (req: ServerRequest) => {

        if (req.method !== 'CONNECT') {
            return req.respond({ status: 204 });
        }

        if (unauthorized(req.headers)) {
            return req.respond(auth_failure);
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





function verify (path?: string) {

    const store = run(() => {
        try {
            return new Set(Object
                .entries(JSON.parse(Deno.readTextFileSync(path!)))
                .map(([ user, pass ]) => btoa(user + ':' + pass))
                .map(data => 'Basic ' + data)
            );
        } catch {
            return new Set();
        }
    });

    return function (headers: Headers) {

        const entry = headers.get('proxy-authorization') ?? 'wat';

        return store.size > 0 && store.has(entry) === false;

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





function port_normalize ({ port, protocol }: URL) {
    return +port || (protocol === 'http:' ? 80 : 443);
}





function tap_catch (err?: Error) {
    console.error(err?.message ?? err?.name);
    throw err;
}





function run (fn: Function) {
    return fn();
}

