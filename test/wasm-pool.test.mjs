import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { load } from '../diagnostics/index.js';
import { kernel } from '../diagnostics/kernel.js';

const pooled = (process.env.GROVEDOM_BACKEND ?? 'wasm') === 'wasm' && (process.env.GROVEDOM_WASM_HEAP ?? 'pool') === 'pool';
test('Wasm pool reuses empty instances, isolates simultaneous documents, and invalidates old handles', { skip: !pooled }, () => {
  kernel.trim();
  const a = load('<p>A</p>'), old = a('p')[0], b = load('<p>B</p>');
  assert.equal(kernel.stats().liveDocuments, 2);
  a.dispose(); a.dispose();
  const idle = kernel.stats();
  assert.equal(idle.idleInstances, 1);
  const c = load('<div>C</div>');
  assert.equal(kernel.stats().idleInstances, 0);
  assert.equal(b('p').text(), 'B');
  assert.equal(c('div').text(), 'C');
  assert.throws(() => old.name, { code: 'ERR_GROVEDOM_DISPOSED' });
  c.dispose(); b.dispose();
  assert.equal(kernel.stats().liveBytes, 0);
  assert.equal(kernel.stats().idleInstances, 2);
  kernel.trim();
  assert.equal(kernel.stats().memoryBytes, 0);
});

test('Wasm pool enforces instance and byte limits and drops oversized heaps', { skip: !pooled }, () => {
  for (const [limit, idle] of [[1572864, 1], [4194304, 2]]) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { load } from ${JSON.stringify(new URL('../diagnostics/index.js', import.meta.url).href)};
      import { kernel } from ${JSON.stringify(new URL('../diagnostics/kernel.js', import.meta.url).href)};
      const docs = Array.from({length: 4}, () => load('<p>x</p>'));
      for (const $ of docs) $.dispose();
      assert.equal(kernel.stats().idleInstances, ${idle});
      assert.ok(kernel.stats().idleMemoryBytes <= ${limit});
      kernel.trim();
      const big = load('<main>' + '<p>some text</p>'.repeat(15000) + '</main>');
      assert.ok(kernel.stats().memoryBytes > ${limit});
      big.dispose();
      assert.equal(kernel.stats().idleInstances, 0);
      assert.equal(kernel.stats().liveBytes, 0);
    `], { env: { ...process.env, GROVEDOM_WASM_POOL_SIZE: '2', GROVEDOM_WASM_POOL_MAX_BYTES: String(limit) }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});

test('Wasm pool GC fallback returns an abandoned instance for reuse', { skip: !pooled }, () => {
  const result = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { load } from ${JSON.stringify(new URL('../diagnostics/index.js', import.meta.url).href)};
    import { kernel } from ${JSON.stringify(new URL('../diagnostics/kernel.js', import.meta.url).href)};
    (() => { const $ = load('<p>abandoned</p>'); $('p').text(); })();
    for (let i = 0; i < 100; i++) {
      await new Promise(setImmediate); global.gc(); await new Promise(setImmediate);
      if (kernel.stats().liveDocuments === 0) break;
    }
    assert.equal(kernel.stats().liveDocuments, 0);
    assert.equal(kernel.stats().liveBytes, 0);
    assert.equal(kernel.stats().idleInstances, 1);
    const $ = load('<p>reused</p>');
    assert.equal(kernel.stats().idleInstances, 0);
    assert.equal($('p').text(), 'reused');
    $.dispose(); kernel.trim();
    assert.equal(kernel.stats().memoryBytes, 0);
  `], { env: process.env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});
