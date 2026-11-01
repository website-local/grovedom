import { init, load, loadFast, merge, type FilterFunction, type NodeHandle, type SelectorType,
  type LoadOptions, type SerializerOptions, type Selection, type FastSelection,
  type FastGroveDOMAPI, type MappedCollection } from 'grovedom';
import { init as initNative, load as loadNative, loadFast as loadNativeFast } from 'grovedom-native';
import { init as initBrowser, load as loadBrowser, loadFast as loadBrowserFast } from 'grovedom/browser';

const initialized: void = init({ wasm: new Uint8Array(), heap: 'pool' });
const nativeInitialized: void = initNative({ addon: new URL('file:///example.node') });
const browserReady: Promise<void> = initBrowser({ wasm: new Uint8Array() });
const options: LoadOptions = { scriptingEnabled: true, baseURI: new URL('https://example.test'),
  xml: { xmlMode: true, decodeEntities: true, lowerCaseTags: false,
    lowerCaseAttributeNames: false, recognizeSelfClosing: true, recognizeCDATA: true,
    selfClosingTags: false, emptyAttrs: true, encodeEntities: 'utf8' } };
const serialization: SerializerOptions = { xmlMode: true, encodeEntities: 'utf8', xml: { emptyAttrs: true } };
const selector: SelectorType = '[data-label="你好"]';
const predicate: FilterFunction<NodeHandle> = function (index, node) {
  const name: string | undefined = this.name;
  return this === node && index > 0 && name !== undefined;
};
for (const open of [load, loadNative, loadBrowser]) {
  const $ = open('<Root/>', options);
  const text: string = $(selector).filter(predicate).text();
  const html: string = $.html(serialization);
  const combined: ArrayLike<number> | undefined = $.merge({ 0: 1, length: 1 }, [2]);
  const flat: { values: (number | null | undefined)[] } = $.extract({ values: [{ selector: 'p', value: () => [1, null, undefined] }] });
  const nested: { values: number[][] } = $.extract({ values: [{ selector: 'p', value: () => [[1]] }] });
  const single: { values: number[] | undefined } = $.extract({ values: { selector: 'p', value: () => [1] } });
  $.dispose();
}
const combined: ArrayLike<number> | undefined = merge([1], [2]);

const compatible = load('<p/>');
const indexed: NodeHandle | undefined = compatible('p').find('i')[0];
const fast = loadFast('<p/>');
for (const open of [loadFast, loadNativeFast, loadBrowserFast]) {
  const $ = open('<p/>', options), selected = $('p');
  const node: NodeHandle | undefined = selected.get(0);
  const chained = selected.attr('title', 'x').find('i').end().clone();
  const nested = $.load('<p/>');
  const sameMode: typeof selected = nested('p');
  const nodeMap: typeof selected = selected.map((_index, value) => value);
  const array: NodeHandle[] | undefined = merge([] as NodeHandle[], selected);
  const merged: typeof selected | undefined = $.merge(selected, selected);
  const local: typeof selected = $('p', selected);
  // @ts-expect-error Fast selections have no numeric index signature.
  const numeric = chained[0];
  // @ts-expect-error Node-valued maps keep the fast selection mode.
  const mappedNode = nodeMap[0];
  // @ts-expect-error Nested documents keep the fast selection mode.
  const nestedNode = nested('p')[0];
  $.dispose();
  nested.dispose();
}
const fastAPI: FastGroveDOMAPI = fast.load('<p/>');
const selected: FastSelection = fast('p').attr({ title: 'x' }).first();
const values: MappedCollection<string, FastSelection> = selected.map((_index, node) => node.name ?? '');
const value: string | undefined = values[0];
const previous: FastSelection | MappedCollection<unknown, FastSelection> | undefined = values.slice(0).end();
const compatibleWithFastContext = compatible('p', selected);
const fastWithCompatibleContext = fast('p', compatible('p'));
const fastWithNodeContext = fast('p', compatible('p').get(0)!);
// @ts-expect-error Foreign contexts may select the fast mode.
const unknownIndex = compatibleWithFastContext[0];
// @ts-expect-error Markup strings still use the receiving document's mode.
const mixedIndex = fastWithCompatibleContext[0];
// @ts-expect-error A node's owner may have either selection mode.
const unknownNodeIndex = fastWithNodeContext[0];
// @ts-expect-error Fast selections cannot promise compatible numeric indexing.
const invalidSelection: Selection = selected;
// @ts-expect-error The supported XML surface excludes parser callbacks.
load('<x/>', { xml: { onopentag() {} } });
// @ts-expect-error Entity encoding only accepts a boolean or 'utf8'.
load('<x/>', { xml: { encodeEntities: 'ascii' } });
// @ts-expect-error Filter callbacks return a boolean.
const invalidFilter: FilterFunction<NodeHandle> = () => 'yes';
