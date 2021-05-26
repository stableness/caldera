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





## Auth json file example

```json
{
    "foo": "bar",
    "hello": "world",
    "username": "password"
}
```





## Server side

serve HTTP
```
deno run --allow-net -- https://deno.land/x/caldera/bin.ts --port.http=9000
```

with auth verification file
```
deno run --allow-net --allow-read -- https://deno.land/x/caldera/bin.ts --port.http=9000 --auth=plain.json
```

serve HTTPs
```
deno run --allow-net --allow-read -- https://deno.land/x/caldera/bin.ts --port.https=9000
```

HTTPs with specified certificate files
```
deno run --allow-net --allow-read -- https://deno.land/x/caldera/bin.ts --port.https=9000 --crt=cert.txt --key=key.txt
```



## Client side

to http proxy
```
curl -p -x http://localhost:9000   http://example.com
```

to http proxy with basic auth
```
curl -p -x http://user:pass@localhost:9000   http://example.com
```

to https proxy with self-signed certificate
```
curl -p -k -x https://localhost:9000   http://example.com
```

