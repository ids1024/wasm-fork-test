export PATH := $(HOME)/Devel/src/binaryen/build/bin:$(PATH)

all: test-async.wasm

test.wasm: test.c
	clang --target=wasm32 -nostdlib -Wl,--export=main -Wl,-no-entry -Wl,--allow-undefined -o $@ $<

%-async.wasm: %.wasm
	wasm-opt --asyncify --pass-arg=asyncify-imports@env.fork -o $@ $<

clean:
	rm -f *.wasm

.PHONY: all clean
