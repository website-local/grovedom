export { load, contains, merge } from './index.js';
export type * from './index.js';
export interface NativeInitOptions { addon?: string | URL; }
export function init(options?: NativeInitOptions): void;
