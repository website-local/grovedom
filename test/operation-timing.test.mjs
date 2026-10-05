import test from 'node:test';
import assert from 'node:assert/strict';
import { createFacade } from '../src/facade/document.js';
import { decodeInput } from '../src/wasm/node.js';
import { kernel } from '../diagnostics/kernel.js';
import { operationTiming, timeFacade } from '../diagnostics/operation-timing.js';

test('domain timers avoid nested double counting and restore after exceptions', () => {
  let clock = 0;
  const timer = operationTiming(() => clock);
  timer.run('dom', () => {
    clock += 2;
    timer.run('dom', () => { clock += 3; }, null, []);
    timer.run(null, () => {
      clock += 5;
      timer.run('uri', () => { clock += 7; }, null, []);
      timer.run('dom', () => { clock += 11; }, null, []);
    }, null, []);
    clock += 13;
  }, null, []);
  assert.deepEqual(timer.snapshot(), { dom: 29, uri: 7 });
  assert.throws(() => timer.run('dom', () => { clock += 17; throw Error('test'); }, null, []));
  assert.equal(timer.snapshot().dom, 46);
  timer.reset(); assert.deepEqual(timer.snapshot(), {});
});
test('facade timing excludes callback work and preserves callback identity and data functions', () => {
  let clock = 0;
  const timer = operationTiming(() => clock);
  const { load } = createFacade(kernel, decodeInput), measured = timeFacade(load, timer);
  const $ = measured('<p>before</p>');
  try {
    const node = $('p')[0], data = () => 'stored';
    $('p').data('function', data);
    assert.equal($('p').data('function'), data);
    $('p').each(function (i, current) {
      assert.equal(this, node); assert.equal(current, node);
      clock += 100;
      $(current).attr('title', function (j, old) { assert.equal(this, node); clock += 200; return 'after'; });
    });
    assert.equal($('p').attr('title'), 'after');
    assert.equal(timer.snapshot().dom, 0);
    assert.throws(() => $('p').each(() => { clock += 300; throw Error('callback'); }), /callback/);
    assert.equal($('p').text(), 'before');
    assert.equal(timer.snapshot().dom, 0);
  } finally { $.dispose(); }
});
