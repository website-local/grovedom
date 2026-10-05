import { init, load, type NodeHandle, type FilterFunction } from 'grovedom';
import { init as initExplicit } from 'grovedom/browser';

const ready: Promise<void> = init({ wasm: new URL('./grovedom.wasm', 'https://example.test') });
const explicitReady: Promise<void> = initExplicit({ wasm: new ArrayBuffer(0) });
const predicate: FilterFunction<NodeHandle> = function (_index, node) { return this === node; };
const $ = load(new Uint8Array());
const text: string = $('p').filter(predicate).text();
$.dispose();
// @ts-expect-error The browser condition exposes asynchronous initialization.
const synchronous: void = init();
