import assert from 'node:assert/strict';
import { once } from 'node:events';
import { parentPort, workerData } from 'node:worker_threads';
import { replay } from './fixtures.mjs';

// Let the parent start several first imports together, before it loads the addon.
parentPort.postMessage({ phase: 'ready' });
await once(parentPort, 'message');
const { load } = await import('../src/index.js');
const { kernel } = await import('../src/kernel.js');
assert.equal(kernel.stats().liveDocuments, 0);
assert.equal(kernel.stats().liveBytes, 0);
const $ = load(`<p>worker ${workerData.id}</p>`);
const node = $('p')[0];
const baseline = kernel.stats().liveBytes;
parentPort.postMessage({ phase: 'loaded', stats: kernel.stats(), node });
await once(parentPort, 'message');

if (workerData.mode === 'replay') {
  for (let i = 0; i < 60; i++) {
    const create = source => load(source, { execution: i % 2 ? 'buffered' : 'direct' });
    assert.equal(replay(create, workerData.source), workerData.expected);
    assert.throws(() => $('['), { code: 'ERR_GROVEDOM_SELECTOR' });
    assert.equal($(node).text(), `worker ${workerData.id}`);
    assert.equal(kernel.stats().liveDocuments, 1);
  }
  // Failed selector parsing may grow scratch capacity, so assert balance only
  // after disposing the surviving document, not its intermediate high-water mark.
  assert.ok(kernel.stats().liveBytes >= baseline);
  $.dispose();
  assert.equal(kernel.stats().liveBytes, 0);
  assert.equal(kernel.stats().liveDocuments, 0);
  parentPort.postMessage({ phase: 'done', stats: kernel.stats() });
  parentPort.close();
} else {
  // Retain owners through worker shutdown: the Node-API finalizer must release
  // them even though explicit disposal and ordinary reachability GC do not run.
  globalThis.retainedDocuments = [$];
  for (let i = 0; i < 12; i++) {
    const doc = load(workerData.source);
    doc('a').attr('data-pending', 'value');
    globalThis.retainedDocuments.push(doc);
  }
  parentPort.postMessage({ phase: 'retained', documents: kernel.stats().liveDocuments });
  if (workerData.mode === 'exit') parentPort.close();
  else parentPort.on('message', () => {});
}
