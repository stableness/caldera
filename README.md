# Caldera

[![Latest Version](https://img.shields.io/endpoint?url=https%3A%2F%2Fapiland.deno.dev%2Fshields%2Fcaldera%2Fversion)](https://deno.land/x/caldera)
[![Check](https://github.com/stableness/caldera/actions/workflows/check.yml/badge.svg)](https://github.com/stableness/caldera/actions)
[![codecov](https://codecov.io/gh/stableness/caldera/branch/master/graph/badge.svg?token=4AOC9D1CXA)](https://codecov.io/gh/stableness/caldera)





## Options

    --auth        - path to auth file (json)                         
    --port.http   - http port                                        
    --port.https  - https port                                       
    --crt         - path to certificate file  (Default: "server.crt")
    --key         - path to certificate key   (Default: "server.key")
    --timeout     - for establishing TCP connection (Default: 500 milliseconds)





## Auth json file example

```json
{
    "foo": "bar",
    "hello": "world",
    "username": "password"
}
```



## Create self-signed certificate

```sh
openssl req -x509 -nodes \
  -days 365 \
  -newkey rsa:2048 \
  -subj "/C=US/CN=example.com" \
  -keyout server.key \
  -out server.crt
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
curl -p --proxy-insecure -x https://localhost:9000   http://example.com
```

