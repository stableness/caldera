import {
    listenAndServe,
    listenAndServeTLS,
} from 'https://deno.land/std@0.96.0/http/server.ts';

import type {
    Response,
    ServerRequest,
} from 'https://deno.land/std@0.96.0/http/server.ts';

import {
    readableStreamFromReader as readable,
    writableStreamFromWriter as writable,
} from 'https://deno.land/std@0.96.0/io/streams.ts';





const {
    PORTS: ports = '80,443',
    CERT:   cert = 'server.crt',
    KEY:     key = 'server.key',
    AUTH:   auth = 'auth.json',
} = Deno.env.toObject();



const auth_store = run(function () {

    try {
        return new Set(Object
            .entries(JSON.parse(Deno.readTextFileSync(auth)))
            .map(([ username, password ]) => btoa(username + ':' + password))
            .map(data => 'Basic ' + data)
        );
    } catch {
        return new Set();
    }

});




export async function main () {

    const [ pHttp, pHttps ] = ports.trim().split(',');

    console.info({ pHttp, pHttps });

    try {

        await Promise.all([

            listenAndServe({
                port: +pHttp,
            }, on_request),

            listenAndServeTLS({
                port: +pHttps,
                certFile: cert,
                keyFile: key,
            }, on_request),

        ]);

    } catch (e) {

        console.error(e);

    }

}




function on_request (req: ServerRequest) {

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

            if (e instanceof Deno.errors.BadResource) {
                return;
            }

            console.error(e);

        }

    };

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

