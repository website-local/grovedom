// Run with --experimental-vm-modules. This validates the portable ESM graph,
// not a claim of testing a separate browser engine.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, createContext } from 'node:vm';
import { resolve } from 'node:path';
// Optional packaged input validates the exact files assembled for Pages.
const packageRoot = process.argv[2] && resolve(process.argv[2]);
const packageURL = 'https://example.test/grovedom/grovedom/';
const fetched = [];
async function readResource(url) {
  if (url.startsWith(packageURL)) return readFile(resolve(packageRoot, url.slice(packageURL.length)));
  assert(url.startsWith('file:'), `Unexpected browser dependency: ${url}`);
  return readFile(new URL(url));
}
class EncodeFallback extends TextEncoder { encodeInto = undefined; }
const context = createContext({ WebAssembly, TextEncoder: process.env.GROVEDOM_BROWSER_FALLBACK ? EncodeFallback : TextEncoder, TextDecoder, URL, console,
  ...(packageRoot ? { fetch: async input => {
    const url = String(input);
    assert.equal(url, packageURL + 'grovedom.wasm', 'Default Wasm URL must stay under the Pages repository path');
    fetched.push(url);
    const bytes = await readResource(url);
    return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  } } : {}),
  ...(process.env.GROVEDOM_BROWSER_FALLBACK ? { FinalizationRegistry: undefined } : {}) });
const modules = new Map();
async function moduleFor(url) {
  if (modules.has(url)) return modules.get(url);
  const source = (await readResource(url)).toString('utf8');
  assert(!/\b(?:process|Buffer)\b|node:/.test(source), `Node dependency in ${url}`);
  const module = new SourceTextModule(source, { context, identifier: url,
    initializeImportMeta(meta) { meta.url = url; } });
  modules.set(url, module);
  await module.link((specifier, parent) => moduleFor(new URL(specifier, parent.identifier).href));
  return module;
}
const entry = await moduleFor(packageRoot ? packageURL + 'src/browser.js'
  : new URL('../src/browser.js', import.meta.url).href);
await entry.evaluate();
if (packageRoot) {
  await entry.namespace.init();
  assert.deepEqual(fetched, [packageURL + 'grovedom.wasm']);
} else {
  const binary = await readFile(resolve(process.env.GROVEDOM_WASM_BUILD_DIR, 'grovedom.wasm'));
  await entry.namespace.init({ wasm: binary });
}
const $ = entry.namespace.load('<main><p>é 😀</p><template><a>x</a></template></main>');
try {
  assert.equal($('p').text(), 'é 😀');
  $('p').text('\ufeffupdated');
  assert.equal($('p').text(), '\ufeffupdated');
  assert.equal($('a').length, 1);
} finally { $.dispose(); }
console.log(`Portable browser module graph passed without Node globals (${modules.size} ESM modules).`);

const conformance = await moduleFor(new URL('./web-platform/browser-runner.mjs', import.meta.url).href);
await conformance.evaluate();
const fixture = await readFile(new URL('./web-platform/selectors.html', import.meta.url), 'utf8');
const readData = async name => JSON.parse(await readFile(new URL('./web-platform/' + name, import.meta.url), 'utf8'));
const failures = [];
const counts = conformance.namespace.runBrowserCases(entry.namespace.load, fixture,
  await readData('selectors.json'), await readData('escapes.json'), result => {
    if (result.status === 'fail') failures.push(result);
  });
assert.deepEqual(failures, []);
assert(counts.pass > 800, 'The browser standards suite must actually execute.');
assert.equal(counts.todo, 0);
console.log('Portable browser correctness: ' + JSON.stringify(counts));
