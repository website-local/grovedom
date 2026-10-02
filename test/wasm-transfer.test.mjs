import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { load } from '../src/index.js';
import { kernel } from '../src/kernel.js';

const wasm = process.env.GROVEDOM_BACKEND === 'wasm';
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
