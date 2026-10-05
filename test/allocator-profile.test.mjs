import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { kernel } from '../diagnostics/kernel.js';

test('allocator phase accounting separates nested calloc and backing requests', { skip: !kernel.profile }, () => {
  kernel.profileReset();
  const $ = load('<main>' + '<p data-x="a">x</p>'.repeat(100) + '</main>');
  $('p').attr('data-x', 'long value'.repeat(500));
  assert.equal($('p').last().attr('data-x').length, 5000);
  $.dispose();
  const profile = kernel.profile();
  assert.equal(profile.malloc[0] + profile.realloc[0], profile.allocationCalls[4]);
  assert(profile.calloc[0] > 0); assert(profile.free[0] > 0);
  for (const name of ['malloc', 'calloc', 'realloc', 'free']) {
    assert(profile[name][1] >= profile[name][2]); assert(profile[name][2] >= 0);
  }
  assert.equal(kernel.stats().liveBytes, 0);
});
