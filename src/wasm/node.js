import { readFileSync } from 'node:fs';
import { Buffer, isUtf8 } from 'node:buffer';
import { createWasmKernel } from './kernel.js';
const bufferToString = Buffer.prototype.toString;
const bufferUTF8Slice = Buffer.prototype.utf8Slice;
const byteLength = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(Uint8Array.prototype), 'byteLength').get;
class UTF8Input {
    constructor(bytes) { this.bytes = bytes; }
}
export const nodePlatform = {
    bytes: buffer => Buffer.from(buffer),
    decode: (bytes, offset, length) => bytes.toString('utf8', offset, offset + length),
};
export function decodeInput(value, byteInput = false) {
    if (Buffer.isBuffer(value)) {
        const decode = value.toString;
        if (!byteInput || decode !== bufferToString || !ArrayBuffer.isView(value) ||
            Object.getPrototypeOf(value) !== Buffer.prototype || byteLength.call(value) < 8192 ||
            Object.getOwnPropertyDescriptor(value, 'length') || Object.getOwnPropertyDescriptor(value, 'utf8Slice') ||
            Object.getOwnPropertyDescriptor(Buffer.prototype, 'utf8Slice')?.value !== bufferUTF8Slice)
            return Reflect.apply(decode, value, ['utf8']);
        // Snapshot before option getters, then validate the exact copied bytes.
        // Typed-array copying ignores Buffer conversion hooks and shadowed views.
        const copy = new Uint8Array(value);
        return isUtf8(copy) ? new UTF8Input(copy) : Buffer.from(copy.buffer).toString('utf8');
    }
    if (value instanceof Uint8Array) {
        const view = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        if (!byteInput || Object.getPrototypeOf(value) !== Uint8Array.prototype ||
            Buffer.prototype.toString !== bufferToString || view.length < 8192) return view.toString('utf8');
        const copy = new Uint8Array(view);
        return isUtf8(copy) ? new UTF8Input(copy) : Buffer.from(copy.buffer).toString('utf8');
    }
    return value;
}
decodeInput.bytes = value => value instanceof UTF8Input ? value.bytes : undefined;
export function nodeWasm(options, diagnostics) {
    const source = options.wasm ?? new URL('../../grovedom.wasm', import.meta.url);
    const module = source instanceof WebAssembly.Module ? source : new WebAssembly.Module(typeof source === 'string' || source instanceof URL ? readFileSync(source) : source);
    return createWasmKernel(module, options, diagnostics ? { ...nodePlatform, imports: diagnostics.imports } : nodePlatform, diagnostics?.inspect);
}
