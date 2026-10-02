import test from 'node:test';
import assert from 'node:assert/strict';
import { createEngineAdapter } from '../integration/engine-adapter.mjs';
import { load } from '../src/index.js';
import { kernel } from '../src/kernel.js';

test('engine scope owns nested loads, explicit disposal and exceptional exits', async () => {
  const adapter = createEngineAdapter(load);
  assert.throws(() => adapter.load(''), /active engine document scope/);
  let child;
  await assert.rejects(adapter.run(async () => {
    const $ = adapter.load('<iframe></iframe>');
    child = $.load('<b>child</b>');
    await Promise.resolve();
    $('iframe').attr('srcdoc', child.html());
    child.dispose();
    adapter.load('<i>temporary</i>');
    throw new Error('hook failed');
  }), /hook failed/);
  assert.throws(() => child.html(), { code: 'ERR_GROVEDOM_DISPOSED' });
  assert.equal(kernel.stats().liveBytes, 0);
});

test('engine scopes isolate concurrent and nested resource families', async () => {
  const adapter = createEngineAdapter(load);
  await Promise.all([1, 2, 3].map(n => adapter.run(async () => {
    const $ = adapter.load(`<p>${n}</p>`);
    await adapter.run(async () => { adapter.load('<i>inner</i>'); });
    await new Promise(setImmediate);
    assert.equal($('p').text(), String(n));
  })));
  assert.equal(kernel.stats().liveBytes, 0);
});
