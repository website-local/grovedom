import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { Worker } from 'node:worker_threads';
import { load as cheerio } from 'cheerio';
import { page, replay } from './fixtures.mjs';

const source = page(40);
const expected = replay(cheerio, source);
function spawn(t, id, mode) {
  const worker = new Worker(new URL('./worker-fixture.mjs', import.meta.url), {
    workerData: { id, mode, source, expected },
  });
  t.after(() => worker.terminate());
  const exit = new Promise(resolve => {
    let error;
    worker.once('error', value => { error = value; });
    worker.once('exit', code => resolve({ code, error }));
  });
  return { worker, ready: once(worker, 'message'), exit };
}

test('concurrent worker imports and DOM operations have independent ownership', { timeout: 30000 }, async t => {
  const workers = Array.from({ length: 4 }, (_, i) => spawn(t, i, 'replay'));
  await Promise.all(workers.map(item => item.ready));
  const loaded = workers.map(({ worker }) => once(worker, 'message'));
  for (const { worker } of workers) worker.postMessage('load');
  const snapshots = await Promise.all(loaded);
  for (const [message] of snapshots) {
    assert.equal(message.phase, 'loaded');
    assert.equal(message.stats.liveDocuments, 1);
    assert.ok(message.stats.liveBytes > 0);
  }

  const { load } = await import('../src/index.js');
  const { kernel } = await import('../src/kernel.js');
  assert.equal(kernel.stats().liveDocuments, 0);
  assert.equal(kernel.stats().liveBytes, 0);
  const $ = load('<main>parent survives</main>');
  try {
    for (const [message] of snapshots) assert.throws(() => $(message.node), TypeError);
    const done = workers.map(({ worker }) => once(worker, 'message'));
    for (const { worker } of workers) worker.postMessage('run');
    // Parent allocation, query, mutation, and disposal overlap worker activity.
    for (let i = 0; i < 60; i++) {
      assert.equal(replay(load, source), expected);
      assert.equal(kernel.stats().liveDocuments, 1);
    }
    for (const [message] of await Promise.all(done)) {
      assert.equal(message.phase, 'done');
      assert.equal(message.stats.liveDocuments, 0);
      assert.equal(message.stats.liveBytes, 0);
    }
    for (const result of await Promise.all(workers.map(item => item.exit))) {
      assert.equal(result.error, undefined);
      assert.equal(result.code, 0);
    }
    assert.equal($('main').text(), 'parent survives');
  } finally { $.dispose(); }
  assert.equal(kernel.stats().liveBytes, 0);
});

for (const mode of ['exit', 'terminate']) {
  test(`worker ${mode} finalizes retained documents while parent remains live`, { timeout: 30000 }, async t => {
    const { load } = await import('../src/index.js');
    const { kernel } = await import('../src/kernel.js');
    const $ = load('<p>parent</p>');
    const bytes = kernel.stats().liveBytes;
    try {
      // Repeated worker creation also exercises addon reinitialization per env.
      for (let i = 0; i < 3; i++) {
        const item = spawn(t, i, mode);
        await item.ready;
        const loaded = once(item.worker, 'message');
        item.worker.postMessage('load');
        await loaded;
        const retained = once(item.worker, 'message');
        item.worker.postMessage('retain');
        assert.equal((await retained)[0].documents, 13);
        if (mode === 'terminate') await item.worker.terminate();
        const result = await item.exit;
        assert.equal(result.error, undefined);
        assert.equal(result.code, mode === 'exit' ? 0 : 1);
        assert.equal(kernel.stats().liveDocuments, 1);
        assert.equal(kernel.stats().liveBytes, bytes);
      }
      assert.equal($('p').text(), 'parent');
    } finally { $.dispose(); }
    assert.equal(kernel.stats().liveBytes, 0);
  });
}
