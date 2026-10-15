import assert from 'node:assert/strict';
import { once } from 'node:events';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { load } from '../diagnostics/index.js';
import { kernel } from '../diagnostics/kernel.js';

function check() {
  const $ = load('<p class="target">text</p>');
  try {
    // Keep fatal native regressions inside the parent test's child process.
    const selector = ':is('.repeat(128000) + 'p' + ')'.repeat(128000) + '[';
    assert.throws(() => $(selector), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
    assert.equal($('p.target:first-child').text(), 'text');
  } finally { $.dispose(); }
  assert.equal(kernel.stats().liveDocuments, 0);
  assert.equal(kernel.stats().liveBytes, 0);
}

if (isMainThread && process.argv[2] === 'worker') {
  const $ = load('<p class="parent">parent</p>');
  try {
    const worker = new Worker(new URL(import.meta.url));
    const exit = once(worker, 'exit');
    const [message] = await once(worker, 'message');
    assert.equal(message, 'safe');
    assert.equal((await exit)[0], 0);
    assert.equal($('p.parent:first-child').text(), 'parent');
  } finally { $.dispose(); }
} else {
  check();
  parentPort?.postMessage('safe');
}
assert.equal(kernel.stats().liveDocuments, 0);
assert.equal(kernel.stats().liveBytes, 0);
if (isMainThread) console.log('safe');
