import { createFacade } from './facade/document.js';
import { createWasmKernel } from './wasm/kernel.js';
import { validateOptions, initializedError } from './initialize.js';
import { browserPlatform, decodeInput } from './wasm/browser.js';
let facade, initializing = false;
/** Async initialization is required in browsers; subsequent DOM calls are synchronous. */
export async function init(options = {}) {
    if (facade || initializing)
        throw initializedError();
    initializing = true;
    try {
        validateOptions(options, ['wasm', 'heap', 'poolSize', 'poolMaxBytes']);
        const settings = { ...options };
        let source = settings.wasm ?? new URL('../grovedom.wasm', import.meta.url);
        if (typeof source === 'string' || source instanceof URL) {
            const response = await fetch(source);
            if (!response.ok)
                throw new Error(`Wasm fetch failed: ${response.status}`);
            source = await response.arrayBuffer();
        }
        const module = source instanceof WebAssembly.Module ? source : await WebAssembly.compile(source);
        facade = createFacade(createWasmKernel(module, settings, browserPlatform), decodeInput);
    }
    finally { initializing = false; }
}
function ready() {
    if (!facade)
        throw new Error('Await GroveDOM init() before DOM calls.');
    return facade;
}
export function load(content, options, isDocument) { return ready().load(content, options, isDocument); }
export function contains(container, contained) { return ready().contains(container, contained); }
export function merge(first, second) { return ready().merge(first, second); }
