import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createFacade } from './facade/document.js';
import { Buffer } from 'node:buffer';
import { validateOptions, initializedError } from './initialize.js';
const require = createRequire(import.meta.url);
let facade;
export function init(options = {}) {
    if (facade)
        throw initializedError();
    validateOptions(options, ['addon']);
    const path = options.addon ?? new URL('../grovedom.node', import.meta.url);
    const kernel = require(path instanceof URL ? fileURLToPath(path) : resolve(path));
    facade = createFacade(kernel, value => value instanceof Uint8Array ? Buffer.from(value.buffer, value.byteOffset, value.byteLength).toString('utf8') : value);
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
