HTTP=7999
HTTPS=8999
ALLOWS=--allow-net --allow-read
BIN=bin.ts
AUTH=auth.json
OUTPUT=dist

TARGETS = x86_64-unknown-linux-gnu\
          x86_64-apple-darwin\
          aarch64-apple-darwin\
          x86_64-pc-windows-msvc\



.PHONY: all clean start dev

all: clean ${OUTPUT}/lock.json ${TARGETS} ${OUTPUT}/checksum.txt
	@ls -la ${OUTPUT}


clean:
	@rm -rf ./${OUTPUT}
	@mkdir ./${OUTPUT}




${TARGETS}:
	@deno compile ${ALLOWS} --lock ${OUTPUT}/lock.json --target $@ -o ./${OUTPUT}/caldera-$@ ${BIN}


${OUTPUT}/lock.json:
	@deno cache ${BIN} --lock-write --lock $@


${OUTPUT}/checksum.txt:
	@sha256sum ${OUTPUT}/*[^.txt] > $@
	@sed -i s#${OUTPUT}/## $@





dev: WATCH := --watch
dev: start


start:
	@deno run ${WATCH} ${ALLOWS} ${BIN} \
		--auth ${AUTH} \
		--port.http ${HTTP} \
		--port.https ${HTTPS} \

