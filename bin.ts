import { main, safe_int, port_verify, parse_range } from './mod.ts';

import { parse         } from 'https://deno.land/std@0.165.0/flags/mod.ts';
import { mapNotNullish } from 'https://deno.land/std@0.165.0/collections/map_not_nullish.ts';





const { timeout, port, ...rest } = parse(Deno.args, {
    string: [ 'auth', 'crt', 'key', 'port.http', 'port.https' ],
    default: {
        'port.http': '',
        'port.https': '',
        timeout: 500, // milliseconds
        crt: 'server.crt',
        key: 'server.key',
    },
});





main({

    ...rest,

    timeout: safe_int ({ min: 0 }) (Number(timeout)),

    port: {
        http: new Set(mapNotNullish(parse_range(port.http), port_verify)),
        https: new Set(mapNotNullish(parse_range(port.https), port_verify)),
    },

}).catch(console.error);

