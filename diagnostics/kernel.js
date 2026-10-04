// Environment variables belong to developer tools, never the shipped runtime.
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { nodeWasm } from '../src/wasm/node.js';
import { readFileSync } from 'node:fs';
import { createWasmKernel } from '../src/wasm/kernel.js';
import { browserPlatform } from '../src/wasm/browser.js';
import { wasmDiagnostics } from './wasm.js';
const backend = process.env.GROVEDOM_BACKEND ?? 'wasm';
if (!['napi', 'wasm'].includes(backend))
    throw new Error('Expected napi or wasm backend.');
const growth = process.env.GROVEDOM_WASM_PROFILE_GROWTH === '1';
export const kernel = backend === 'napi'
    ? createRequire(import.meta.url)(resolve(process.env.GROVEDOM_BUILD_DIR ?? 'build/native', 'grovedom.node'))
    : (process.env.GROVEDOM_TEST_BROWSER === '1' ? portableWasm : nodeWasm)({
        wasm: resolve(process.env.GROVEDOM_WASM_BUILD_DIR ?? 'build/wasm', growth ? 'grovedom-growth.wasm' : 'grovedom.wasm'),
        heap: process.env.GROVEDOM_WASM_HEAP ?? 'pool',
        poolSize: Number(process.env.GROVEDOM_WASM_POOL_SIZE ?? 8),
        poolMaxBytes: Number(process.env.GROVEDOM_WASM_POOL_MAX_BYTES ?? 16 * 1024 * 1024),
    }, wasmDiagnostics({ profile: process.env.GROVEDOM_PROFILE === '1', growth }));
function portableWasm(options, diagnostics) {
    const module = new WebAssembly.Module(readFileSync(options.wasm));
    return createWasmKernel(module, options, { ...browserPlatform, imports: diagnostics.imports }, diagnostics.inspect);
}
