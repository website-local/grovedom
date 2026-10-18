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

for (const entry of ['index', 'native', 'browser']) {
  const available = existsSync(entry === 'native' ? nativePath : wasmPath);
  const settings = () => entry === 'native' ? { addon: nativePath }
    : { wasm: new WebAssembly.Module(readFileSync(wasmPath)) };

  for (const boundary of ['source getter', 'option enumeration']) {
    test(`${entry} initialization rejects reentry during ${boundary}`, { skip: !available }, async () => {
      const api = await fresh(entry, `reentry-${boundary.replaceAll(' ', '-')}`);
      const valid = settings(), errors = [], earlyLoads = [];
      function reenter() {
        try {
          const result = api.init(valid);
          errors.push(Promise.resolve(result).then(() => null, error => error));
        } catch (error) { errors.push(Promise.resolve(error)); }
        try {
          const $ = api.load('<p>must wait</p>');
          $.dispose();
          earlyLoads.push(null);
        } catch (error) { earlyLoads.push(error); }
      }
      const key = entry === 'native' ? 'addon' : 'wasm';
      const options = boundary === 'source getter'
        ? { get [key]() { reenter(); return valid[key]; } }
        : new Proxy(valid, { ownKeys(target) { reenter(); return Reflect.ownKeys(target); } });
      await api.init(options);
      assert.ok(errors.length > 0);
      for (const error of await Promise.all(errors))
        assert.match(error?.message ?? 'Nested initialization succeeded', /already initialized/);
      for (const error of earlyLoads)
        assert.match(error?.message ?? 'DOM use succeeded before initialization', entry === 'browser' ? /Await/ : /already initialized/);
      const $ = api.load('<p>original owner</p>');
      try {
        assert.equal(api.contains($.root()[0], $('p')[0]), true);
        assert.equal($('p').text(), 'original owner');
      } finally { $.dispose(); }
      await assert.rejects(async () => api.init(valid), /already initialized/);
    });
  }

  test(`${entry} initialization can retry after an option getter throws`, { skip: !available }, async () => {
    const api = await fresh(entry, 'getter-failure');
    const failure = new Error('option getter failed'), valid = settings();
    const key = entry === 'native' ? 'addon' : 'wasm';
    await assert.rejects(async () => api.init({ get [key]() { throw failure; } }), error => error === failure);
    await api.init(valid);
    const $ = api.load('<p>retried</p>');
    try { assert.equal($('p').text(), 'retried'); }
    finally { $.dispose(); }
  });
}

test('browser initialization holds its lock before calling fetch', { skip: !existsSync(wasmPath) }, async () => {
  const api = await fresh('browser', 'fetch-reentry');
  const bytes = Uint8Array.from(readFileSync(wasmPath));
  const module = new WebAssembly.Module(bytes), originalFetch = globalThis.fetch;
  let nested;
  globalThis.fetch = () => {
    nested = api.init({ wasm: module }).then(() => null, error => error);
    return Promise.resolve({ ok: true, arrayBuffer: async () => bytes.buffer });
  };
  try {
    await api.init({ wasm: 'https://example.invalid/grovedom.wasm' });
    assert.match((await nested)?.message ?? 'Nested initialization succeeded', /already initialized/);
    const $ = api.load('<p>fetched</p>');
    try { assert.equal(api.contains($.root()[0], $('p')[0]), true); }
    finally { $.dispose(); }
  } finally { globalThis.fetch = originalFetch; }
});
