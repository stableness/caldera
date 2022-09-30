import * as ast from 'https://deno.land/std@0.158.0/testing/asserts.ts';
import * as mock from 'https://deno.land/std@0.158.0/testing/mock.ts';

import {

    port_normalize,
    port_verify,
    pre_verify,

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





Deno.test('pre_verify', async () => {

    const noop = mock.spy(() => {});

    const verify = pre_verify(noop, path => new Promise((resolve, reject) => {
        path instanceof URL ? reject() : resolve(path);
    }));

    const check = await verify(`{
        "foo": "bar",
        "admin": "password"
    }`);

    const mk_header = (user: string, pass: string) => new Headers({
        'proxy-authorization': 'Basic ' + btoa(user + ':' + pass),
    });

    const mk_assert = (c: typeof check, b?: boolean, h?: Headers) => {
        return (u: string, p: string) => {
            ast.assertStrictEquals(
                c?.(h ?? mk_header(u, p)),
                b,
                `${ u } : ${ p }`,
            );
        }
    }



    {
        const auth = mk_assert(check, true);

        auth('foo', 'bar');
        auth('admin', 'password');
    }

    {
        const auth = mk_assert(check, false, new Headers());

        auth('foo', 'bar');
        auth('admin', 'password');
    }

    {
        const auth = mk_assert(check, false);

        auth('a', 'b')
        auth('FOO', 'bar');
        auth('admin', 'PASSWORD');
    }

    {
        const arr = [
            '',
            '  ',
            '{]',
            '{}',
            'wat',
            undefined,
            new URL('http://a'),
        ];

        for (const v of await Promise.all(arr.map(verify))) {
            mk_assert (v, undefined) ('hello', 'world');
        }

        mock.assertSpyCalls(noop, arr.length);
    }

});

