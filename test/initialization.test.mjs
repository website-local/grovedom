import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const wasmPath = resolve(process.env.GROVEDOM_WASM_BUILD_DIR ?? 'build/wasm', 'grovedom.wasm');
const nativePath = resolve(process.env.GROVEDOM_BUILD_DIR ?? 'build/native', 'grovedom.node');
const fresh = (entry, id) => import(new URL(`../src/${entry}.js?init-test=${id}`, import.meta.url));

test('Node Wasm explicit initialization ignores runtime environment and metadata', { skip: !existsSync(wasmPath) }, async () => {
  const api = await fresh('index', 'node');
  assert.throws(() => api.init({ unknown: true }), /Unknown initialization option/);
  assert.throws(() => api.init({ wasm: wasmPath, poolSize: -1 }), /nonnegative/);
  assert.throws(() => api.init({ wasm: wasmPath + '.missing' }));
  api.init({ wasm: readFileSync(wasmPath), heap: 'pool', poolSize: 2 });
  const $ = api.load(new Uint8Array(Buffer.from('<p>é 😀</p>')));
  try { assert.equal($('p').text(), 'é 😀'); }
  finally { $.dispose(); }
  assert.throws(() => api.init({ wasm: wasmPath }), /already initialized/);
});

test('browser async initialization, retry, and BOM-preserving output', { skip: !existsSync(wasmPath) }, async () => {
  const api = await fresh('browser', 'browser');
  assert.throws(() => api.load('<p>early</p>'), /Await/);
  await assert.rejects(api.init({ wasm: new Uint8Array([0, 1, 2]) }));
  const ready = api.init({ wasm: readFileSync(wasmPath) });
  assert.throws(() => api.load('<p>pending</p>'), /Await/);
  await assert.rejects(api.init(), /already initialized/);
  await ready;
  const $ = api.load('<p>\ufeffé 😀</p>');
  try { assert.equal($('p').text(), '\ufeffé 😀'); }
  finally { $.dispose(); }
  await assert.rejects(api.init(), /already initialized/);
});

test('native and Wasm package facades own independent handle brands', { skip: !existsSync(wasmPath) || !existsSync(nativePath) }, async () => {
  const wasm = await fresh('index', 'independent'), native = await fresh('native', 'independent');
  wasm.init({ wasm: new WebAssembly.Module(readFileSync(wasmPath)) });
  native.init({ addon: pathToFileURL(nativePath) });
  const a = wasm.load('<p>A</p>'), b = native.load('<p>B</p>');
  try {
    assert.throws(() => a(b('p')[0]), /Expected/);
    assert.throws(() => b(a('p')[0]), /Expected/);
    assert.equal(a('p').text(), 'A');
    assert.equal(b('p').text(), 'B');
  } finally { a.dispose(); b.dispose(); }
});
