import * as ast from 'https://deno.land/std@0.159.0/testing/asserts.ts';
import * as mock from 'https://deno.land/std@0.159.0/testing/mock.ts';

import { concat } from 'https://deno.land/std@0.159.0/bytes/mod.ts';
import { delay } from 'https://deno.land/std@0.159.0/async/mod.ts';

import {

    ServerRequest,
    type Response,

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
    pre_on_request,
    pre_tunnel_to,
    main,
    try_catch,

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





Deno.test('pre_on_request', async () => {

    const tunnel = mock.spy(
        (_p: number, _h: string) => (_req: unknown) => Promise.resolve()
    );

    const on_request = pre_on_request({

        tunnel,

        verify: input => Promise.resolve(
            input instanceof URL
                ? _ => input.href.endsWith('admin')
                : undefined
        ),

    });

    const host = 'foobar';
    const port = 8080;
    const hostname = `${ host }:${ port }`;

    { // GET

        const handle = await on_request({});

        const respond = mock.spy((res: Response) => Promise.resolve(
            ast.assertNotStrictEquals(res.status, 200),
        ));

        const req = new ServerRequest();

        req.method = 'GET';
        req.respond = respond;

        handle(req);

        mock.assertSpyCalls(respond, 1);

    }

    { // CONNECT without auth

        const handle = await on_request({});

        const req = new ServerRequest();

        req.url = hostname;
        req.method = 'CONNECT';

        handle(req);

        mock.assertSpyCallArgs(tunnel, 0, 0, [ port, host ]);

    }

    { // CONNECT with auth by guest

        const handle = await on_request({ auth: 'guest' });

        const respond = mock.spy((res: Response) => Promise.resolve(
            ast.assertStrictEquals(res.status, 407),
        ));

        const req = new ServerRequest();

        req.url = hostname;
        req.method = 'CONNECT';
        req.respond = respond;

        handle(req);

        mock.assertSpyCalls(respond, 1);

    }

    { // CONNECT with auth by admin

        const handle = await on_request({ auth: 'admin' });

        const req = new ServerRequest();

        req.url = hostname;
        req.method = 'CONNECT';

        handle(req);

        mock.assertSpyCallArgs(tunnel, 1, 0, [ port, host ]);

    }

});





Deno.test('main', async () => {

    await ast.assertRejects(() => main({}), Error, 'program exited');

});





Deno.test('try_catch', () => {

    const foo = { bar: 1 };

    ast.assertStrictEquals(try_catch(() => foo), foo);

    ast.assertEquals(
        try_catch(() => { throw new Error('wat') }),
        new Error('wat'),
    );

    ast.assertEquals(
        try_catch(() => { throw 2 }),
        new Error('unknown', { cause: 2 }),
    );

});





Deno.test('pre_tunnel_to', async () => {

    class Duplex implements Deno.Reader, Deno.Writer {

        #used = false
        #sink = Uint8Array.of()

        constructor (
            private readonly init: Uint8Array,
            private readonly error?: Error,
        ) {
        }

        read (p: Uint8Array): Promise<number | null> {

            if (this.error != null) {
                return Promise.reject(this.error);
            }

            if (this.#used) {
                return Promise.resolve(null);
            }

            p.set(this.init);
            this.#used = true;
            return Promise.resolve(this.init.byteLength);

        }

        write (p: Uint8Array): Promise<number> {

            if (this.error != null) {
                return Promise.reject(this.error);
            }

            this.#sink = concat(this.#sink, p);
            return Promise.resolve(p.byteLength);

        }

        collect (): Uint8Array {
            return this.#sink;
        }

    }



    const port = 8080;
    const hostname = 'localhost';

    const head = Uint8Array.of(0);
    const body = Uint8Array.from([ 1, 2, 3 ]);

    { // succeeded with no error

        const req = new Duplex(body);
        const res = new Duplex(body);

        const error = mock.spy(() => { });

        const connect = mock.spy((_opts: Deno.ConnectOptions) => {
            return Promise.resolve(req);
        });

        const tunnel = pre_tunnel_to({
            head,
            error,
            connect,
            ignoring: _ => false,
        });

        await tunnel (port, hostname) (res);

        mock.assertSpyCallArg(connect, 0, 0, { port, hostname });

        mock.assertSpyCalls(error, 0);

        ast.assertEquals(
            concat(head, req.collect()),
            res.collect(),
        );

    }

    { // logging error while tunneling

        const err = new RangeError();

        const req = new Duplex(body, err);
        const res = new Duplex(body, err);

        const error = mock.spy(() => { });

        const tunnel = pre_tunnel_to({
            head,
            error,
            connect: _ => Promise.resolve(req),
            ignoring: _ => false,
        });

        await tunnel (port, hostname) (res);

        mock.assertSpyCallArg(error, 0, 0, err);

    }

    { // connection timeout

        const error = mock.spy(() => { });

        const req = new Duplex(body);
        const res = new Duplex(body);

        const ctrl = new AbortController();
        const { signal } = ctrl;

        const tunnel = pre_tunnel_to({
            head,
            error,
            connect: _ => delay(500, { signal }).then(() => req),
            ignoring: _ => false,
        });

        await tunnel (port, hostname) (res, 20);

        ctrl.abort();

        mock.assertSpyCalls(error, 1);

    }

});

