HTTP=7999
HTTPS=8999
ALLOWS=--allow-net --allow-read
BIN=bin.ts
AUTH=auth.json
OUTPUT=output

TARGETS = x86_64-unknown-linux-gnu\
          x86_64-apple-darwin\
          aarch64-apple-darwin\
          x86_64-pc-windows-msvc\



.PHONY: all clean start dev

all: clean ${TARGETS}
	@echo done


clean:
	@rm -rf ./${OUTPUT}
	@mkdir ./${OUTPUT}




${TARGETS}:
	@deno compile ${ALLOWS} --target $@ -o ./${OUTPUT}/caldera-$@ ${BIN}




dev: WATCH := --watch
dev: start


start:
	@deno run ${WATCH} ${ALLOWS} ${BIN} \
		--auth ${AUTH} \
		--port.http ${HTTP} \
		--port.https ${HTTPS} \

