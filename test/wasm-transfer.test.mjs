import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { load } from '../src/index.js';
import { kernel } from '../src/kernel.js';

const wasm = process.env.GROVEDOM_BACKEND === 'wasm';
test('string results preserve leading BOM, Unicode, NUL and prior values after disposal', () => {
  const $ = load('<p>initial</p>');
  const value = '\ufeff\u0000é汉字🪴';
  let saved;
  try {
    $('p').attr('title', value).text(value);
    saved = $('p').text();
    assert.equal(saved, value);
    assert.equal($('p').attr('title'), value);
  } finally { $.dispose(); }
  assert.equal(saved, value);
});

test('Wasm transfer scratch handles its boundary, overflow and interleaved owners', { skip: !wasm }, () => {
  const a = kernel.create('<p>A</p>', true, false), b = kernel.create('<p>B</p>', true, false);
  const roots = Uint32Array.of(1), ai = kernel.query(a, 'p', roots, false), bi = kernel.query(b, 'p', roots, false);
  try {
    // One SET_TEXT command uses seven words; cross the combined word/payload
    // capacity, then return to small transfers through the other document.
    for (const length of [16384 - 28, 16384 - 27, 32768, 17]) {
      const payload = new Uint8Array(length).fill(65);
      kernel.execute(a, Uint32Array.of(3, 1, 0, length, 0, 0, ai[0]), payload);
      const saved = kernel.read(a, 2, ai, '');
      kernel.execute(b, Uint32Array.of(3, 1, 0, 1, 0, 0, bi[0]), Uint8Array.of(66));
      assert.equal(kernel.read(b, 2, bi, ''), 'B');
      assert.equal(kernel.read(a, 2, ai, ''), 'A'.repeat(length));
      assert.equal(saved, 'A'.repeat(length));
      assert.deepEqual(kernel.query(a, 'p', roots, false), ai);
    }
  } finally { kernel.dispose(a); kernel.dispose(b); }
  assert.equal(kernel.stats().liveBytes, 0);
});

test('pending commands stay document-owned across nested callbacks', () => {
  const a = load('<p>A</p>'), b = load('<p>B</p>');
  try {
    const ap = a('p'), bp = b('p');
    ap.attr('title', 'A queued');
    bp.attr('title', 'B queued');
    bp.each(() => {
      assert.equal(ap.attr('title'), 'A queued');
      ap.text('A changed');
      assert.equal(bp.attr('title'), 'B queued');
      bp.text('B changed');
    });
    assert.equal(ap.text(), 'A changed');
    assert.equal(bp.text(), 'B changed');
    ap.text('discarded');
    a.dispose();
    assert.equal(bp.text(), 'B changed');
  } finally { a.dispose(); b.dispose(); }
  assert.equal(kernel.stats().liveBytes, 0);
});

test('Wasm transfers refresh after growth and preserve copied results and Unicode', { skip: !wasm }, () => {
  const $ = load('<main><p title="🪴">original</p></main>');
  const p = $('p'), node = p[0], original = p.text();
  const before = kernel.stats().memoryBytes;
  const large = load('<main>' + '<p>another document</p>'.repeat(20000) + '</main>');
  try {
    assert.ok(kernel.stats().memoryBytes > before);
    assert.equal(p.attr('title'), '🪴');
    const text = '汉字🪴'.repeat(80000);
    p.text(text);
    assert.equal(p.text(), text);
    $('main').append('<p title="é">new</p>');
    assert.equal($('p')[0], node);
    assert.equal(p.length, 1);
    assert.equal(original, 'original');
    assert.equal($('p').last().attr('title'), 'é');
    assert.equal(large('p').length, 20000);
  } finally { large.dispose(); $.dispose(); }
  assert.equal(kernel.stats().liveBytes, 0);
});

test('retaining disposed Wasm selections does not retain a released heap buffer', {
  skip: !wasm || (process.env.GROVEDOM_WASM_HEAP ?? 'global') === 'global',
}, () => {
  const result = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { load } from ${JSON.stringify(new URL('../src/index.js', import.meta.url).href)};
    import { kernel } from ${JSON.stringify(new URL('../src/kernel.js', import.meta.url).href)};
    const OriginalInstance = WebAssembly.Instance;
    let memory;
    WebAssembly.Instance = class extends OriginalInstance {
      constructor(...args) { super(...args); memory = this.exports.memory; }
    };
    const { retained, buffer } = (() => {
      const $ = load('<p>retained</p>'), retained = $('p');
      assert.equal(retained.text(), 'retained');
      const buffer = new WeakRef(memory.buffer);
      $.dispose(); kernel.trim(); memory = null;
      return { retained, buffer };
    })();
    WebAssembly.Instance = OriginalInstance;
    for (let i = 0; i < 100; i++) {
      await new Promise(setImmediate); global.gc(); await new Promise(setImmediate);
      if (!buffer.deref()) break;
    }
    assert.equal(buffer.deref(), undefined, 'Disposed owner retained its heap buffer');
    assert.throws(() => retained.text(), { code: 'ERR_GROVEDOM_DISPOSED' });
    assert.equal(kernel.stats().liveBytes, 0);
  `], { encoding: 'utf8', env: process.env });
  assert.equal(result.status, 0, result.stderr);
});
