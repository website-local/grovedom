export { load, contains, merge } from './index.js';
export type * from './index.js';
import type { InitOptions } from './index.js';
/** Fetch or compile the same Wasm binary asynchronously before DOM calls. */
export function init(options?: InitOptions): Promise<void>;
