import * as ast from 'https://deno.land/std@0.159.0/testing/asserts.ts';
import * as mock from 'https://deno.land/std@0.159.0/testing/mock.ts';

import {

    type ServerRequest,

} from './deps.ts'

import {

    type Opts,
    type Handle,

    port_normalize,
    port_verify,
    pre_verify,
    pre_tap_catch,
    pre_serves,
    ignores,

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

    const warn = mock.spy(() => {});

    const auth_header = 'proxy-authorization';

    const read_file = (input: string | URL) => {
        return new Promise<string>((resolve, reject) => {
            if (input instanceof URL) {
                if (input.hash.startsWith('#')) {
                    resolve(decodeURIComponent(input.hash.slice(1)));
                } else {
                    reject()
                }
            } else {
                resolve(input);
            }
        });
    };

    const verify = pre_verify({ warn, auth_header, read_file });

    await verify(new URL('http://foobar#{ "a": 1 }'));

    const check = await verify(`{
        "foo": "bar",
        "admin": "password"
    }`);

    const mk_header = (user: string, pass: string) => new Headers({
        [auth_header]: 'Basic ' + btoa(user + ':' + pass),
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
            new URL('http://a'),
        ];

        for (const v of await Promise.all(arr.map(verify))) {
            mk_assert (v, undefined) ('hello', 'world');
        }

        mock.assertSpyCalls(warn, arr.length);
    }

});





Deno.test('pre_tap_catch', () => {

    const noop = mock.spy(() => {});
    const tap = pre_tap_catch(noop);

    const name = 'Name';
    const cause = 'Cause';
    const message = 'Message';



    {
        const err = new RangeError();
        ast.assertThrows(() => tap(err));
        mock.assertSpyCall(noop, 0, { args: [ 'RangeError' ] });
    }

    {
        const err = new Error();
        err.name = name;
        ast.assertThrows(() => tap(err));
        mock.assertSpyCall(noop, 1, { args: [ name ] });
    }

    {
        ast.assertThrows(() => tap(new Error(message)), message);
        mock.assertSpyCall(noop, 2, { args: [ message ] });
    }

    {
        ast.assertThrows(() => tap(new Error(message, { cause })), message);
        mock.assertSpyCall(noop, 3, { args: [ cause ] });
    }

});





Deno.test('ignores', () => {

    {
        const arr = [

            Deno.errors.BadResource,
            Deno.errors.BrokenPipe,
            Deno.errors.ConnectionReset,

        ];

        for (const clazz of arr) {
            ast.assert(
                ignores(new clazz()),
                `${ clazz.name } to be ignored}`,
            );
        }
    }

    {
        const arr = [

            TypeError,
            RangeError,
            Deno.errors.NotConnected,
            Deno.errors.PermissionDenied,

        ];

        for (const clazz of arr) {
            ast.assertFalse(
                ignores(new clazz()),
                `${ clazz.name } to not be ignored}`,
            );
        }
    }

});





Deno.test('pre_serves', async () => {

    const info = (_: ServerRequest) => { };
    const handle = mock.spy(info);

    const serving = <T> (_: T, cb: Handle) => {
        return Promise.resolve(cb({} as never));
    };

    const read_file = (path?: string | URL) => {
        return new Promise<string>((resolve, reject) => {
            path === '' ? reject() : resolve('file');
        });
    };

    const {
        serve_http,
        serve_https,
    } = pre_serves({ info, read_file, serve: serving, serve_TLS: serving });

    const serve = (o: Opts) => [
        serve_http(o, handle),
        serve_https(o, handle),
    ];

    const http = 41;
    const https = 42;
    const key = 'key';
    const crt = 'crt';

    {

        const arr: ReadonlyArray<Opts> = [
            {},
            { port: {} },
            { port: { http: -1 } },
            { port: { https: -1 } },
            { port: { https }, key },
            { port: { https }, key, crt: '' },
            { port: { https }, crt, key: '' },
            { port: { https }, key: '', crt: '' },
        ];

        const result = await Promise.allSettled(arr.flatMap(serve));

        ast.assert(
            result.every(r => r.status === 'rejected'),
            'reject on invalid options',
        );

    }

    await Promise.all(serve({ port: { http, https }, key, crt }));

    mock.assertSpyCalls(handle, 2);

});

