import { main } from './mod.ts'

import { Command } from 'https://deno.land/x/cliffy@v0.19.2/command/mod.ts';




const { options } = await new Command()

    .name('caldera')

    .option('--auth [auth]', 'path to auth file (json)')

    .option('--port.http [http:number]', 'http port')

    .option('--port.https [https:number]', 'https port')
    .option('--crt [crt]', 'path to certificate file', { default: 'server.crt' })
    .option('--key [key]', 'path to certificate key', { default: 'server.key' })

    .parse(Deno.args)

;





main(options).catch(console.error);

