import * as ast from 'https://deno.land/std@0.158.0/testing/asserts.ts';

import {

    port_normalize,

} from './mod.ts';





Deno.test('port_normalize', () => {

    const eq = (str: string, res: number) => {
        ast.assertStrictEquals(port_normalize(new URL(str)), res, str);
    };

    eq('http://example.com', 80);
    eq('https://example.com', 443);

    eq('http://example.com:80', 80);
    eq('https://example.com:443', 443);

    eq('https://example.com:80', 80);
    eq('http://example.com:443', 443);

});

