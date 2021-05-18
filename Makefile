HTTP=7999
HTTPS=8999
ALLOWS=--allow-net --allow-read
BIN=bin.ts

T_LINUX=x86_64-unknown-linux-gnu
T_MACOS=x86_64-apple-darwin



.PHONY: all
all: build-linux build-macos
	@echo done


build-linux:
	@deno compile ${ALLOWS} --target ${T_LINUX} --output "./caldera-${T_LINUX}" ${BIN}

build-macos:
	@deno compile ${ALLOWS} --target ${T_MACOS} --output "./caldera-${T_MACOS}" ${BIN}





dev: WATCH := --watch
dev: start


start:
	@deno run ${WATCH} ${ALLOWS} ${BIN} --port.http ${HTTP} --port.https ${HTTPS}

