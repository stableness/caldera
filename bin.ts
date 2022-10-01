import { main } from './mod.ts'

import { parse } from 'https://deno.land/std@0.158.0/flags/mod.ts';





const { port: port_, ...rest } = parse(Deno.args, {
    string: [ 'auth', 'crt', 'key' ],
    default: {
        port: {
            http: 0,
            https: 0,
        },
        crt: 'server.crt',
        key: 'server.key',
    }
});

const port = { http: 0, https: 0, ...port_ ?? {} };





main({ port, ...rest }).catch(console.error);

