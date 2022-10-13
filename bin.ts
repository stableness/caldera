import { main, safe_int } from './mod.ts'

import { parse } from 'https://deno.land/std@0.159.0/flags/mod.ts';





const { port: port_, timeout: timeout_, ...rest } = parse(Deno.args, {
    string: [ 'auth', 'crt', 'key' ],
    default: {
        port: {
            http: 0,
            https: 0,
        },
        timeout: 500, // milliseconds
        crt: 'server.crt',
        key: 'server.key',
    }
});

const port = { http: 0, https: 0, ...port_ ?? {} };

const timeout = safe_int ({ min: 0 }) (Number(timeout_));





main({ port, timeout, ...rest }).catch(console.error);

