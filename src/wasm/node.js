import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { createWasmKernel } from './kernel.js';
export const nodePlatform = {
    bytes: buffer => Buffer.from(buffer),
    decode: (bytes, offset, length) => bytes.toString('utf8', offset, offset + length),
};
export function decodeInput(value) {
    if (Buffer.isBuffer(value))
        return value.toString('utf8');
    return value instanceof Uint8Array ? Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('utf8') : value;
}
export function nodeWasm(options, diagnostics) {
    const source = options.wasm ?? new URL('../../grovedom.wasm', import.meta.url);
    const module = source instanceof WebAssembly.Module ? source : new WebAssembly.Module(typeof source === 'string' || source instanceof URL ? readFileSync(source) : source);
    return createWasmKernel(module, options, diagnostics ? { ...nodePlatform, imports: diagnostics.imports } : nodePlatform, diagnostics?.inspect);
}
