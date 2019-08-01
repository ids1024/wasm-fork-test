// https://kripken.github.io/blog/wasm/2019/07/16/asyncify.html

'use strict';

const fs = require('fs');
const child_process = require('child_process');
const process = require('process');

const JS_PATH = 'wasm.js';
const WASM_PATH = 'test-async.wasm';
const STACK_SIZE = 1024;

let forking = (process.argv[2] === '--forked');
let instance;
let data_addr;
let view;
let child;

async function main(mem) {
    let env = {
        print: console.log,
        fork: function() {
            if (!forking) {
                view[data_addr / 4] = data_addr + 8;
                view[data_addr / 4 + 1] = data_addr + 8 + STACK_SIZE;

                instance.exports.asyncify_start_unwind(data_addr);
                forking = true;
            } else {
                instance.exports.asyncify_stop_rewind();
                forking = false;
                if (child) {
                    return child.pid;
                } else {
                    return 0;
                }
            }
        },
        getpid: function() { return process.pid; }
    };

    let wasm = fs.readFileSync(WASM_PATH);
    instance = (await WebAssembly.instantiate(wasm, {env: env})).instance;
    view = new Int32Array(instance.exports.memory.buffer);

    if (mem) {
        view.set(mem);
    }

    data_addr = instance.exports.__heap_base.value;

    do {
        if (forking) {
            instance.exports.asyncify_start_rewind(data_addr);
        }

        instance.exports.main();

        if (forking) {
            instance.exports.asyncify_stop_unwind();
            child = child_process.fork(JS_PATH, ['--forked']);
            child.send(Array.from(view));
        }
    } while(forking);
}

if (forking) {
    process.on('message', (m) => {
        process.disconnect();
        main(m);
    });
} else {
    main();
}
