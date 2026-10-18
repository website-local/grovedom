import { createFacade } from './facade/document.js';
import { nodeWasm, decodeInput } from './wasm/node.js';
import { validateOptions, initializedError } from './initialize.js';
let facade, initializing = false;
/** Configure once, before load/contains/merge. Without init(), first use loads the bundled Wasm. */
export function init(options = {}) {
    if (facade || initializing)
        throw initializedError();
    initializing = true;
    try {
        validateOptions(options, ['wasm', 'heap', 'poolSize', 'poolMaxBytes']);
        facade = createFacade(nodeWasm(options), decodeInput);
    }
    finally { initializing = false; }
}
export function load(content, options, isDocument) {
    if (!facade)
        init();
    return facade.load(content, options, isDocument);
}
export function contains(container, contained) {
    if (!facade)
        init();
    return facade.contains(container, contained);
}
export function merge(first, second) {
    if (!facade)
        init();
    return facade.merge(first, second);
}
