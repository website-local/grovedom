// Run with --experimental-vm-modules. This validates the portable ESM graph,
// not a claim of testing a separate browser engine.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, createContext } from 'node:vm';
class EncodeFallback extends TextEncoder { encodeInto = undefined; }
const context = createContext({ WebAssembly, TextEncoder: process.env.GROVEDOM_BROWSER_FALLBACK ? EncodeFallback : TextEncoder, TextDecoder, URL, console,
  ...(process.env.GROVEDOM_BROWSER_FALLBACK ? { FinalizationRegistry: undefined } : {}) });
const modules = new Map();
async function moduleFor(url) {
  if (modules.has(url)) return modules.get(url);
  assert(url.startsWith('file:'), `Unexpected browser dependency: ${url}`);
  const source = await readFile(new URL(url), 'utf8');
  assert(!/\b(?:process|Buffer)\b|node:/.test(source), `Node dependency in ${url}`);
  const module = new SourceTextModule(source, { context, identifier: url,
    initializeImportMeta(meta) { meta.url = url; } });
  modules.set(url, module);
  await module.link((specifier, parent) => moduleFor(new URL(specifier, parent.identifier).href));
  return module;
}
const entry = await moduleFor(new URL('../src/browser.js', import.meta.url).href);
await entry.evaluate();
const binary = await readFile(new URL('file://' + process.env.GROVEDOM_WASM_BUILD_DIR + '/grovedom.wasm'));
await entry.namespace.init({ wasm: binary });
const $ = entry.namespace.load('<main><p>é 😀</p><template><a>x</a></template></main>');
try {
  assert.equal($('p').text(), 'é 😀');
  $('p').text('\ufeffupdated');
  assert.equal($('p').text(), '\ufeffupdated');
  assert.equal($('a').length, 1);
} finally { $.dispose(); }
console.log(`Portable browser module graph passed without Node globals (${modules.size} ESM modules).`);
