# Caldera

## Options

```
deno run -- https://deno.land/x/caldera/bin.ts --help
```

    -h, --help    - Show this help.                                  
    --auth        - path to auth file (json)                         
    --port.http   - http port                                        
    --port.https  - https port                                       
    --crt         - path to certificate file  (Default: "server.crt")
    --key         - path to certificate key   (Default: "server.key")





## Usage

### serve HTTP

```
deno run --allow-net -- https://deno.land/x/caldera/bin.ts --port.http=9000
```

### with auth verification file

```
deno run --allow-net --allow-read -- https://deno.land/x/caldera/bin.ts --port.http=9000 --auth=plain.json
```

### serve HTTPs

```
deno run --allow-net --allow-read -- https://deno.land/x/caldera/bin.ts --port.https=9000
```

### HTTPs with specified certificate files

```
deno run --allow-net --allow-read -- https://deno.land/x/caldera/bin.ts --port.https=9000 --crt=cert.txt --key=key.txt
```





## Auth json file example

```json
{
    "foo": "bar",
    "hello": "world",
    "username": "password"
}
```

