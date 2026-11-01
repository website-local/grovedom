import { init, load, loadFast, type NodeHandle, type FilterFunction, type FastSelection } from 'grovedom';
import { init as initExplicit, loadFast as loadExplicitFast } from 'grovedom/browser';

const ready: Promise<void> = init({ wasm: new URL('./grovedom.wasm', 'https://example.test') });
const explicitReady: Promise<void> = initExplicit({ wasm: new ArrayBuffer(0) });
const predicate: FilterFunction<NodeHandle> = function (_index, node) { return this === node; };
const $ = load(new Uint8Array());
const text: string = $('p').filter(predicate).text();
const flat: { values: (1 | null)[] } = $.extract({ values: [{ selector: 'p', value: () => [1, null] as const }] });
const nested: { values: number[][] } = $.extract({ values: [{ selector: 'p', value: () => [[1]] }] });
$.dispose();
for (const open of [loadFast, loadExplicitFast]) {
  const fast = open('<p/>');
  const selected: FastSelection = fast('p').filter(predicate).end();
  const node: NodeHandle | undefined = selected.get(0);
  const values = selected.map((_index, value) => value.name ?? '');
  const name: string | undefined = values[0];
  // @ts-expect-error Fast selections omit numeric indexing in the browser too.
  const indexed = selected[0];
  fast.dispose();
}
// @ts-expect-error The browser condition exposes asynchronous initialization.
const synchronous: void = init();
