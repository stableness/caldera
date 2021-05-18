import {
    listenAndServe,
    listenAndServeTLS,
} from 'https://deno.land/std@0.97.0/http/server.ts';

import type {
    Response,
    ServerRequest,
} from 'https://deno.land/std@0.97.0/http/server.ts';

import {
    readableStreamFromReader as readable,
    writableStreamFromWriter as writable,
} from 'https://deno.land/std@0.97.0/io/streams.ts';





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

    return listenAndServe({ port }, handle);

}





function serve_https (opts: Opts, handle: Handle) {

    const port = opts.port?.https ?? 0;
    const { crt: certFile, key: keyFile } = opts;

    if (port < 1) {
        return Promise.reject(new Error('no https port'));
    }

    console.info(`https [${ port }]`);

    return listenAndServeTLS({ port, certFile, keyFile }, handle);

}





type Handle = ReturnType<typeof on_request>;

function on_request ({ auth }: Opts) {

    const auth_store = run(function () {

        try {
            return new Set(Object
                .entries(JSON.parse(Deno.readTextFileSync(auth!)))
                .map(([ username, password ]) => btoa(username + ':' + password))
                .map(data => 'Basic ' + data)
            );
        } catch {
            return new Set();
        }

    });

    return (req: ServerRequest) => {

        const { method, url, headers } = req;

        if (method !== 'CONNECT') {
            req.respond({ status: 204 });
            return;
        }

        const authorization = headers.get('proxy-authorization') ?? 'wat';

        if (auth_store.size > 0 && auth_store.has(authorization) === false) {
            return req.respond(auth_failure);
        }

        const newURL = new URL(`http://${ url }`);

        const { hostname } = newURL;
        const port = port_normalize(newURL);

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


function run (fn: Function) {
    return fn();
}

