import assert from 'node:assert/strict';
import { Worker, isMainThread } from 'node:worker_threads';
import { load } from '../diagnostics/index.js';
import { kernel } from '../diagnostics/kernel.js';

function sameNodes(actual, expected) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) assert.equal(actual[i], expected[i]);
}

if (isMainThread && process.argv[2] === 'worker') {
  await new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url));
    worker.once('error', reject);
    worker.once('exit', code => code === 0 ? resolve() : reject(new Error(`Worker exited ${code}`)));
  });
} else {
  for (const execution of ['buffered', 'direct']) for (const xml of [false, true]) {
    const $ = load('<main><p id="a"></p><p id="b"></p><p id="c"></p></main>', { execution, xml });
    try {
      const [a, b, c] = $('p').get();
      $(a).after([b, b]);
      // The old kernel hangs here. Only the parent process timeout can stop it.
      sameNodes($(b).nextAll().get(), [c]);
      sameNodes($(b).prevAll().get(), [a]);
      sameNodes($('main').children().get(), [a, b, c]);
    } finally { $.dispose(); }
  }
  assert.equal(kernel.stats().liveDocuments, 0);
  assert.equal(kernel.stats().liveBytes, 0);
}
console.log('Repeated insertion traversal completed safely.');
