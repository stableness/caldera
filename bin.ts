import { main, safe_int, port_verify, parse_range } from './mod.ts';

import { parse         } from 'https://deno.land/std@0.165.0/flags/mod.ts';
import { mapNotNullish } from 'https://deno.land/std@0.165.0/collections/map_not_nullish.ts';





const { port: port_, timeout: timeout_, ...rest } = parse(Deno.args, {
    string: [ 'auth', 'crt', 'key', 'port.http', 'port.https' ],
    default: {
        'port.http': '',
        'port.https': '',
        timeout: 500, // milliseconds
        crt: 'server.crt',
        key: 'server.key',
    }
});

const port = {
    http: new Set(mapNotNullish(parse_range(port_.http), port_verify)),
    https: new Set(mapNotNullish(parse_range(port_.https), port_verify)),
};

const timeout = safe_int ({ min: 0 }) (Number(timeout_));





main({ port, timeout, ...rest }).catch(console.error);

