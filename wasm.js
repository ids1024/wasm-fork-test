#!/usr/bin/env node

'use strict';

// https://kripken.github.io/blog/wasm/2019/07/16/asyncify.html
// TODO return value of fork (-1, 0, pid of parent)

const fs = require('fs');
const child_process = require('child_process');
const process = require('process');

const JS_PATH = 'wasm.js';
const WASM_PATH = 'test-async.wasm';
const STACK_SIZE = 1024;


class ForkHandler {
    load_instance(mem, instance, data_addr, stack_size, create_fork) {
        this.instance = instance;
        this.data_addr = data_addr;
        this.child_pid = 0;
        this.forking = (mem !== undefined);
        this.create_fork = create_fork;
        this.view = new Int32Array(instance.exports.memory.buffer);

        // If we are a new process created in a fork, load memory
        if (mem) {
            this.view.set(mem);
        }

        // Configure the structure asyncify uses to save stack
        this.view[data_addr / 4] = data_addr + 8;
        this.view[data_addr / 4 + 1] = data_addr + 8 + stack_size;
    }

    call(function_name, ...args) {
        do {
            if (this.forking) {
                this.instance.exports.asyncify_start_rewind(this.data_addr);
            }

            this.instance.exports[function_name](...args);

            if (this.forking) {
                this.instance.exports.asyncify_stop_unwind();
                this.child_pid = this.create_fork(this.view);
            }
        } while(this.forking);
    }

    fork() {
        if (!this.forking) {
            this.instance.exports.asyncify_start_unwind(this.data_addr);
        } else {
            this.instance.exports.asyncify_stop_rewind();
        }
        this.forking = !this.forking;
        return this.child_pid;
    }
}


async function main(mem) {
    let fork_handler = new ForkHandler();

    let env = {
        print: console.log,
        fork: fork_handler.fork.bind(fork_handler),
        getpid: function() { return process.pid; }
    };

    let wasm = fs.readFileSync(WASM_PATH);
    let instance = (await WebAssembly.instantiate(wasm, {env: env})).instance;
    let data_addr = instance.exports.__heap_base.value;

    fork_handler.load_instance(mem, instance, data_addr, STACK_SIZE, view => {
        let child = child_process.fork(JS_PATH, ['--forked']);
        child.send(Array.from(view));
        return child.pid;
    });

    fork_handler.call("main");
}


if (process.argv[2] === '--forked') {
    process.on('message', (mem) => {
        process.disconnect();
        main(mem);
    });

} else {
    main();
}
