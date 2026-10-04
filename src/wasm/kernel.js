import { createEncoder } from '../encoding.js';
import { buildConfig } from '../build-config.js';
// Portable transport. The host supplies byte decoding and optional diagnostic imports.
export function createWasmKernel(module, { heap = 'pool', poolSize = 8, poolMaxBytes = 16 * 1024 * 1024 } = {}, platform, inspect) {
    if (!['global', 'document', 'pool'].includes(heap))
        throw new TypeError('Expected global, document, or pool Wasm heap.');
    const perDocument = heap !== 'global';
    const pooled = heap === 'pool';
    if (!Number.isSafeInteger(poolSize) || poolSize < 0 || !Number.isSafeInteger(poolMaxBytes) || poolMaxBytes < 0)
        throw new Error('Wasm pool limits must be nonnegative integers.');
    const pool = [];
    let poolBytes = 0;
    const encoder = createEncoder(), decoder = new TextDecoder();
    const empty = new Uint32Array();
    const owners = new WeakMap();
    let observer;
    function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
    function instance() {
        const runtime = new WebAssembly.Instance(module, platform.imports).exports;
        platform.runtimeCreated?.(runtime);
        runtime.gk_init();
        return { ...runtime, scratch: runtime.gk_scratch() };
    }
    const shared = perDocument ? null : instance();
    function acquire() {
        if (!pool.length)
            return instance();
        const runtime = pool.pop();
        poolBytes -= runtime.memory.buffer.byteLength;
        return runtime;
    }
    function release(runtime) {
        const bytes = runtime.memory.buffer.byteLength;
        if (pooled && pool.length < poolSize && bytes <= poolMaxBytes - poolBytes) {
            pool.push(runtime);
            poolBytes += bytes;
        }
        else
            observer?.retire(runtime);
    }
    const registry = typeof FinalizationRegistry === "function" ? new FinalizationRegistry(held => {
        if (held.runtime) {
            held.runtime.gk_delete(held.pointer);
            if (pooled)
                release(held.runtime);
        }
        observer?.collected(held.observation);
    }) : null;
    function owner(value, allowClosed = false) {
        const state = owners.get(value);
        if (!state)
            fail('ERR_GROVEDOM_HANDLE', 'Invalid document owner');
        if (!state.pointer && !allowClosed)
            fail('ERR_GROVEDOM_DISPOSED', 'Document has been disposed');
        return state;
    }
    function cstring(runtime, pointer) {
        const bytes = new Uint8Array(runtime.memory.buffer);
        const end = bytes.indexOf(0, pointer);
        return decoder.decode(bytes.subarray(pointer, end < 0 ? bytes.length : end));
    }
    function check(state, result) {
        if (!result)
            fail(cstring(state.runtime, state.runtime.gk_error_code(state.pointer)), cstring(state.runtime, state.runtime.gk_error_message(state.pointer)));
        return result;
    }
    function views(state) {
        // Non-shared Wasm growth detaches the old buffer, making its view length zero.
        // This also detects growth by another document in the global heap. Borrowed
        // views never escape to callers; read memory.buffer only when refreshing them.
        if (!state.bytes?.length) {
            const buffer = state.runtime.memory.buffer;
            state.bytes = platform.bytes(buffer);
            state.words = new Uint32Array(buffer);
        }
    }
    function input(state, value) {
        if (typeof value !== 'string')
            fail('ERR_GROVEDOM_ARGUMENT', 'Expected a UTF-8 encodable string');
        const runtime = state.runtime;
        const pointer = check(state, runtime.gk_input(state.pointer, value.length * 3));
        views(state);
        let written = 0;
        if (value.length <= 128) {
            while (written < value.length && value.charCodeAt(written) < 128) {
                state.bytes[pointer + written] = value.charCodeAt(written);
                written++;
            }
        }
        if (written !== value.length) {
            written = encoder.encodeInto(value, state.bytes.subarray(pointer, pointer + value.length * 3)).written;
        }
        runtime.gk_input(state.pointer, written);
    }
    function ids(state, value) {
        if (!(value instanceof Uint32Array) || !(value.buffer instanceof ArrayBuffer))
            fail('ERR_GROVEDOM_ARGUMENT', 'Expected an ordinary Uint32Array');
        const pointer = transfer(state, value.byteLength);
        views(state);
        state.words.set(value, pointer >>> 2);
        return pointer;
    }
    function transfer(state, length) {
        // Shared within one instance, only during a synchronous kernel call. Large
        // operations retain the existing document-owned, geometrically grown buffer.
        if (length > 0x7fffffff)
            fail('ERR_GROVEDOM_MEMORY', 'Transfer exceeds the Wasm memory limit');
        return length <= 16384 ? state.runtime.scratch : check(state, state.runtime.gk_transfer(state.pointer, length));
    }
    function result(state, pointer) {
        check(state, pointer);
        views(state);
        // Private wasm32 gd_result layout: kind, data pointer, length, scalar.
        const fields = state.words, offset = pointer >>> 2;
        const data = fields[offset + 1], length = fields[offset + 2];
        switch (fields[offset]) {
            case 0: return undefined;
            case 1: return platform.decode(state.bytes, data, length);
            case 2: return fields[offset + 3];
            case 3: return length ? fields.slice(data >>> 2, (data >>> 2) + length) : empty;
            case 4: return null;
            default: throw new Error('Invalid kernel result');
        }
    }
    const kernel = {
        configuration: { heap, initialPages: buildConfig.initialPages, stackBytes: buildConfig.stackBytes },
        createXML(html, flags) { return this.create(html, true, false, flags); },
        create(html, scripting, fragment, xmlFlags) {
            if (typeof scripting !== 'boolean' || typeof fragment !== 'boolean')
                fail('ERR_GROVEDOM_ARGUMENT', 'Expected parser flags');
            const runtime = shared ?? acquire(), pointer = runtime.gk_new();
            if (!pointer)
                fail('ERR_GROVEDOM_MEMORY', 'Owner allocation failed');
            const state = { runtime, pointer, bytes: null, words: null };
            try {
                input(state, html);
                check(state, xmlFlags === undefined ? runtime.gk_parse(pointer, Number(scripting), Number(fragment)) : runtime.gk_parse_xml(pointer, xmlFlags));
            }
            catch (error) {
                runtime.gk_delete(pointer);
                if (perDocument)
                    release(runtime);
                throw error;
            }
            const handle = Object.freeze({});
            owners.set(handle, state);
            if (heap !== 'document' || observer) {
                const held = heap === 'document' ? {} : { runtime, pointer };
                if (observer)
                    held.observation = observer.create(handle, runtime);
                registry?.register(handle, held, handle);
            }
            return handle;
        },
        dispose(handle) {
            const state = owner(handle, true);
            if (!state.pointer)
                return;
            registry?.unregister(handle);
            observer?.dispose(handle);
            state.runtime.gk_delete(state.pointer);
            if (perDocument)
                release(state.runtime);
            state.pointer = 0;
            state.runtime = null;
            state.bytes = state.words = null;
        },
        query(handle, selector, roots, match) {
            const state = owner(handle);
            if (typeof match !== 'boolean')
                fail('ERR_GROVEDOM_ARGUMENT', 'Expected matching flag');
            input(state, selector);
            const pointer = ids(state, roots);
            return result(state, state.runtime.gk_query(state.pointer, pointer, roots.length, Number(match)));
        },
        read(handle, operation, nodes, name) {
            const state = owner(handle);
            if (!Number.isInteger(operation))
                fail('ERR_GROVEDOM_ARGUMENT', 'Expected read operation');
            if (operation === 1)
                input(state, name);
            let pointer, count;
            if (typeof nodes === 'number') {
                if (!Number.isInteger(nodes) || nodes < 0 || nodes > 0xffffffff)
                    fail('ERR_GROVEDOM_ARGUMENT', 'Expected a node ID');
                pointer = transfer(state, 4);
                views(state);
                state.words[pointer >>> 2] = nodes;
                count = 1;
            }
            else {
                pointer = ids(state, nodes);
                count = nodes.length;
            }
            return result(state, state.runtime.gk_read(state.pointer, operation, pointer, count));
        },
        observe(handle, operation, nodes, name, words, payload) {
            const state = owner(handle);
            if (!(words instanceof Uint32Array) || !(words.buffer instanceof ArrayBuffer) ||
                !(payload instanceof Uint8Array) || !(payload.buffer instanceof ArrayBuffer))
                fail('ERR_GROVEDOM_ARGUMENT', 'Expected ordinary command and payload arrays');
            if (!Number.isInteger(operation))
                fail('ERR_GROVEDOM_ARGUMENT', 'Expected read operation');
            const scalar = typeof nodes === 'number';
            if (scalar ? !Number.isInteger(nodes) || nodes < 0 || nodes > 0xffffffff
                : !(nodes instanceof Uint32Array) || !(nodes.buffer instanceof ArrayBuffer))
                fail('ERR_GROVEDOM_ARGUMENT', 'Expected node IDs');
            if (operation !== 1)
                name = '';
            if (typeof name !== 'string')
                fail('ERR_GROVEDOM_ARGUMENT', 'Expected a UTF-8 encodable string');
            const count = scalar ? 1 : nodes.length;
            const pointer = transfer(state, words.byteLength + count * 4 + payload.byteLength + name.length * 3);
            const nodePointer = pointer + words.byteLength, payloadPointer = nodePointer + count * 4;
            const namePointer = payloadPointer + payload.byteLength;
            views(state);
            state.words.set(words, pointer >>> 2);
            if (scalar)
                state.words[nodePointer >>> 2] = nodes;
            else
                state.words.set(nodes, nodePointer >>> 2);
            state.bytes.set(payload, payloadPointer);
            let written = 0;
            while (written < name.length && name.charCodeAt(written) < 128) {
                state.bytes[namePointer + written] = name.charCodeAt(written);
                written++;
            }
            if (written !== name.length)
                written = encoder.encodeInto(name, state.bytes.subarray(namePointer, namePointer + name.length * 3)).written;
            return result(state, state.runtime.gk_observe(state.pointer, pointer, words.length, payloadPointer, payload.byteLength, operation, nodePointer, count, namePointer, written));
        },
        traverse(handle, nodes, axis) {
            const state = owner(handle);
            if (!Number.isInteger(axis))
                fail('ERR_GROVEDOM_ARGUMENT', 'Expected traversal axis');
            const pointer = ids(state, nodes);
            return result(state, state.runtime.gk_traverse(state.pointer, pointer, nodes.length, axis));
        },
        execute(handle, words, payload) {
            const state = owner(handle);
            if (!(words instanceof Uint32Array) || !(words.buffer instanceof ArrayBuffer) ||
                !(payload instanceof Uint8Array) || !(payload.buffer instanceof ArrayBuffer))
                fail('ERR_GROVEDOM_ARGUMENT', 'Expected ordinary command and payload arrays');
            const pointer = transfer(state, words.byteLength + payload.byteLength);
            views(state);
            state.words.set(words, pointer >>> 2);
            state.bytes.set(payload, pointer + words.byteLength);
            check(state, state.runtime.gk_execute(state.pointer, pointer, words.length, pointer + words.byteLength, payload.byteLength));
        },
        edit(handle, operation, nodes, other, text) {
            const state = owner(handle);
            if (!(nodes instanceof Uint32Array) || !(nodes.buffer instanceof ArrayBuffer) ||
                !(other instanceof Uint32Array) || !(other.buffer instanceof ArrayBuffer))
                fail('ERR_GROVEDOM_ARGUMENT', 'Expected ordinary node arrays');
            input(state, text);
            const pointer = transfer(state, nodes.byteLength + other.byteLength);
            views(state);
            state.words.set(nodes, pointer >>> 2);
            state.words.set(other, (pointer + nodes.byteLength) >>> 2);
            return result(state, state.runtime.gk_edit(state.pointer, operation, pointer, nodes.length, pointer + nodes.byteLength, other.length));
        },
        trim() {
            for (const runtime of pool)
                observer?.retire(runtime);
            pool.length = 0;
            poolBytes = 0;
        },
    };
    observer = inspect?.({ kernel, shared, acquire, release, input, check, fail, heap, perDocument, pool, cstring,
        get poolBytes() { return poolBytes; } });
    return kernel;
}
