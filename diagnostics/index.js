import { createFacade } from '../src/facade/document.js';
import { decodeInput } from '../src/wasm/node.js';
import { kernel } from './kernel.js';
export const { load, contains, merge } = createFacade(kernel, decodeInput);
