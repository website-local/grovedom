import { createFacade } from './facade/document.js';
import { createWasmKernel } from './wasm/kernel.js';
import { validateOptions, initializedError } from './initialize.js';
import { browserPlatform, decodeInput } from './wasm/browser.js';
let facade, pending;
/** Async initialization is required in browsers; subsequent DOM calls are synchronous. */
export async function init(options = {}) {
    if (facade || pending)
        return Promise.reject(initializedError());
    validateOptions(options, ['wasm', 'heap', 'poolSize', 'poolMaxBytes']);
    const settings = { ...options };
    pending = (async () => {
        let source = settings.wasm ?? new URL('../grovedom.wasm', import.meta.url);
        if (typeof source === 'string' || source instanceof URL) {
            const response = await fetch(source);
            if (!response.ok)
                throw new Error(`Wasm fetch failed: ${response.status}`);
            source = await response.arrayBuffer();
        }
        const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
        facade = createFacade(createWasmKernel(module, settings, browserPlatform), decodeInput);
    })().finally(() => { pending = undefined; });
    return pending;
}
function ready() {
    if (!facade)
        throw new Error('Await GroveDOM init() before DOM calls.');
    return facade;
}
export function load(content, options, isDocument) { return ready().load(content, options, isDocument); }
export function contains(container, contained) { return ready().contains(container, contained); }
export function merge(first, second) { return ready().merge(first, second); }
