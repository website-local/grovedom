import { init, load, merge, type FilterFunction, type NodeHandle, type SelectorType,
  type LoadOptions, type SerializerOptions } from 'grovedom';
import { init as initNative, load as loadNative } from 'grovedom-native';
import { init as initBrowser, load as loadBrowser } from 'grovedom/browser';

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
  $.dispose();
}
const combined: ArrayLike<number> | undefined = merge([1], [2]);
// @ts-expect-error The supported XML surface excludes parser callbacks.
load('<x/>', { xml: { onopentag() {} } });
// @ts-expect-error Entity encoding only accepts a boolean or 'utf8'.
load('<x/>', { xml: { encodeEntities: 'ascii' } });
// @ts-expect-error Filter callbacks return a boolean.
const invalidFilter: FilterFunction<NodeHandle> = () => 'yes';
