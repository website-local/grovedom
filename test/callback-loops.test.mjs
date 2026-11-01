import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';

const markup = '<main><i id="a" data-count="7">A</i><i id="b">B</i><i id="c">C</i></main>';
const disposed = { code: 'ERR_GROVEDOM_DISPOSED' };

for (const xml of [false, true]) for (const execution of ['buffered', 'direct']) {
  const options = { xml, execution }, label = `xml=${xml}, ${execution}`;

  test(`is callbacks retain occurrence snapshots and stop on truthy results (${label})`, () => {
    const $ = load(markup, options);
    try {
      const nodes = $('i').get(), selected = $([nodes[0], nodes[1], nodes[0], nodes[2]]), seen = [];
      assert.equal(selected.is(function (index, node) {
        seen.push([index, node.attribs.id, this === node]);
        if (!index) {
          selected[1] = nodes[2];
          selected.splice(2, 1);
          $(nodes[1]).remove();
        }
        return index === 2 ? {} : 0;
      }), true);
      assert.deepEqual(seen, [[0, 'a', true], [1, 'b', true], [2, 'a', true]]);
      assert.equal(selected.length, 3);
      assert.equal(selected.is(() => false), false);
      const empty = $('missing');
      assert.equal(empty.is(() => { throw new Error('Empty callback'); }), false);
      const error = new Error('User predicate');
      let calls = 0;
      assert.throws(() => selected.is(() => { calls++; throw error; }), caught => caught === error);
      assert.equal(calls, 1);
      $.dispose();
      assert.throws(() => empty.is(() => true), disposed);
    } finally { $.dispose(); }
  });

  test(`is callbacks recheck disposal only before another visit (${label})`, () => {
    for (const index of [0, 2]) for (const matched of [false, true]) {
      const $ = load(markup, options), selected = $('i');
      let calls = 0;
      const run = () => selected.is(i => {
        calls++;
        if (i !== index) return false;
        $.dispose();
        return matched;
      });
      try {
        if (!index && !matched) assert.throws(run, disposed);
        else assert.equal(run(), matched);
        assert.equal(calls, index + 1);
        assert.throws(() => selected.is(() => true), disposed);
      } finally { $.dispose(); }
    }
  });

  test(`removeData clears selected caches without mutating retained data objects (${label})`, () => {
    const $ = load(markup, options);
    try {
      const all = $('i'), nodes = all.get(), payload = { retained: true };
      all.data({ cached: payload, count: 99 });
      const previous = all.first().data(), selected = $([nodes[0], nodes[0], nodes[1]]);
      assert.equal(selected.removeData() === selected, true);
      assert.equal(previous.cached === payload, true);
      assert.equal(previous.count, 99);
      assert.equal(all.eq(0).data('cached'), undefined);
      assert.equal(all.eq(1).data('cached'), undefined);
      assert.equal(all.eq(0).data('count'), 7);
      assert.equal(all.eq(2).data('cached') === payload, true);
      const remaining = all.eq(2);
      assert.equal(remaining.removeData('cached') === remaining, true);
      assert.equal(remaining.data('count'), 99);
      assert.equal(remaining.removeData(undefined) === remaining, true);
      assert.equal(remaining.data('count'), undefined);
      const empty = $('missing');
      assert.equal(empty.removeData() === empty, true);
      $.dispose();
      assert.throws(() => all.removeData(), disposed);
      assert.throws(() => empty.removeData(), disposed);
    } finally { $.dispose(); }
  });
}
