import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { load } from '../src/index.js';
import { kernel } from '../src/kernel.js';

test('explicit disposal is idempotent and invalidates selections and node handles', () => {
  const $ = load('<p>owned output</p>'), p = $('p'), node = p[0], output = $.html();
  p.text('unobserved');
  $.dispose(); $.dispose();
  for (const read of [() => $.html(), () => p.text(), () => p.length, () => node.type, () => $('p')]) {
    assert.throws(read, { code: 'ERR_GROVEDOM_DISPOSED' });
  }
  assert.match(output, /owned output/);
  assert.equal(kernel.stats().liveDocuments, 0);
  assert.equal(kernel.stats().liveBytes, 0);
});

test('disposal inside a callback prevents later callbacks from observing freed nodes', () => {
  const $ = load('<p>a</p><p>b</p>');
  let calls = 0;
  assert.throws(() => $('p').each(() => { calls++; $.dispose(); }), { code: 'ERR_GROVEDOM_DISPOSED' });
  assert.equal(calls, 1);
});

test('repeated lifecycles, invalid selector cleanup, cache eviction, and simultaneous owners', () => {
  const survivor = load('<b>survives</b>');
  for (let round = 0; round < 80; round++) {
    const $ = load('<p data-v="0">text</p>');
    try {
      for (let i = 0; i < 40; i++) $(`p[data-v="${i}"]`);
      for (const selector of ['[', '???', ':unknown']) assert.throws(() => $(selector));
      for (let i = 0; i < 100; i++) $('p').attr('data-v', i).text(`value ${i}`);
      assert.equal($('p').text(), 'value 99');
    } finally { $.dispose(); }
    assert.equal(survivor('b').text(), 'survives');
    assert.equal(kernel.stats().liveDocuments, 1);
  }
  survivor.dispose();
  assert.equal(kernel.stats().liveBytes, 0);
});

test('native bounds, owner validation, and partial-batch errors', () => {
  const owner = kernel.create('<p>x</p>', true, false);
  const ids = kernel.query(owner, 'p', Uint32Array.of(1), false);
  try {
    assert.throws(() => kernel.execute({}, new Uint32Array(), new Uint8Array()), { code: 'ERR_GROVEDOM_HANDLE' });
    assert.throws(() => kernel.execute(owner, Uint32Array.of(1), new Uint8Array()), { code: 'ERR_GROVEDOM_COMMAND' });
    assert.throws(() => kernel.execute(owner, Uint32Array.of(3, 1, 0xffffffff, 2, 0, 0, ids[0]), new Uint8Array()), { code: 'ERR_GROVEDOM_COMMAND' });
    assert.throws(() => kernel.read(owner, 2, Uint32Array.of(0xffffffff), ''), { code: 'ERR_GROVEDOM_HANDLE' });
    assert.throws(() => kernel.execute(owner, new Uint32Array(new SharedArrayBuffer(32)), new Uint8Array()), { code: 'ERR_GROVEDOM_ARGUMENT' });
    assert.throws(() => kernel.execute(owner, Uint32Array.of(3, 1, 0, 1, 0, 0, ids[0], 99), Uint8Array.of(65)), { code: 'ERR_GROVEDOM_COMMAND' });
    assert.equal(kernel.read(owner, 2, ids, ''), 'A');
  } finally { kernel.dispose(owner); }
  assert.throws(() => kernel.query(owner, 'p', Uint32Array.of(1), false), { code: 'ERR_GROVEDOM_DISPOSED' });
  assert.equal(kernel.stats().liveBytes, 0);
});

test('warmed repeated text and attribute writes need no new native backing allocations', () => {
  const $ = load('<p>initial content with spare capacity</p>', { execution: 'direct' });
  const p = $('p');
  try {
    p.attr('data-x', 'long enough').text('first');
    p.text();
    const before = kernel.stats();
    for (let i = 0; i < 2000; i++) p.attr('data-x', 'value').text('next');
    const after = kernel.stats();
    assert.equal(after.allocations, before.allocations);
    assert.equal(after.liveBytes, before.liveBytes);
    assert.equal(p.text(), 'next');
    const retained = p.contents();
    p.text('replacement');
    assert.equal(retained.text(), 'next');
    assert.equal(p.text(), 'replacement');
  } finally { $.dispose(); }
  assert.equal(kernel.stats().liveBytes, 0);
});

test('repeated unobserved subtree replacement returns nodes to document pools', () => {
  const $ = load('<main></main>', { execution: 'direct' }), main = $('main');
  try {
    for (let i = 0; i < 100; i++) main.html('<p>replacement</p>');
    const before = kernel.stats();
    for (let i = 0; i < 1000; i++) main.html('<p>replacement</p>');
    const after = kernel.stats();
    assert.equal(after.liveBytes, before.liveBytes);
    assert.equal(main.text(), 'replacement');
  } finally { $.dispose(); }
});

test('owner finalizer frees unreachable documents and retained selections keep them alive', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { load } from './src/index.js';
    import { kernel } from './src/kernel.js';
    let retained = load('<p>retained</p>')('p');
    for (let i = 0; i < 12; i++) load('<p>garbage</p>')('p')[0];
    for (let i = 0; i < 30 && kernel.stats().liveDocuments > 1; i++) { global.gc(); await new Promise(setImmediate); }
    assert.equal(kernel.stats().liveDocuments, 1);
    assert.equal(retained.text(), 'retained');
    retained = null;
    for (let i = 0; i < 30 && kernel.stats().liveDocuments; i++) { global.gc(); await new Promise(setImmediate); }
    assert.equal(kernel.stats().liveDocuments, 0);
    assert.equal(kernel.stats().liveBytes, 0);
  `;
  const result = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', script], { encoding: 'utf8', env: process.env });
  assert.equal(result.status, 0, result.stderr);
});
