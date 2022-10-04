import * as ast from 'https://deno.land/std@0.158.0/testing/asserts.ts';

import {

    port_normalize,
    port_verify,

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





Deno.test('port_verify', () => {

    const eq = (n: unknown, res: number | undefined, msg = n) => {
        ast.assertStrictEquals(port_verify(n), res, `${ msg }`);
    };

    const eq_undefined = (n: unknown) => eq(n, undefined);



    eq( 80,  80);
    eq(443, 443);

    eq_undefined(true);
    eq_undefined(false);
    eq_undefined('');
    eq_undefined('42');
    eq_undefined(NaN);
    eq_undefined(2n);
    eq_undefined(-1);
    eq_undefined(4.2);
    eq_undefined(999999);

});

