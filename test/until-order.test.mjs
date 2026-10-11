import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

for (const xml of [false, true]) for (const execution of ['buffered', 'direct']) {
  test(`until traversal preserves repeated roots, stop callbacks and edits, xml=${xml}, ${execution}`, () => {
    const source = '<main id="m"><section id="s">' + Array.from({ length: 16 }, (_, i) =>
      `<p id="p${i}" class="${i % 2 ? 'keep' : ''}${i === 10 ? ' stop' : ''}"><b id="b${i}">text</b></p>`).join('') + '</section></main>';
    const trace = factory => {
      const $ = factory(source, { xml, execution });
      const out = selection => selection.get().map(node => $(node).attr('id'));
      try {
        const all = $('p').get(), records = [];
        for (const roots of [[all[0]], [all[2], all[0], all[2], all[5]], [...all].reverse()]) {
          const selected = $(roots);
          for (const method of ['nextUntil', 'prevUntil', 'parentsUntil']) {
            for (const stop of [undefined, '.stop', all[10], $(all[10])]) {
              const result = selected[method](stop, '.keep');
              records.push([method, out(result), result.end() === selected]);
            }
          }
        }
        const events = [], selected = $([all[1], all[0], all[1], all[3]]);
        const result = selected.nextUntil(function (index, node) {
          events.push([index, this === node, $(node).attr('id'), $(node).attr('data-visit') ?? null]);
          $(node).attr('data-visit', String(events.length));
          return $(node).hasClass('stop');
        });
        records.push([out(result), events]);
        for (const method of ['nextUntil', 'prevUntil', 'parentsUntil']) {
          const filterEvents = [];
          const filtered = selected[method](undefined, function (i, node) {
            filterEvents.push([i, this === node, $(node).attr('id') ?? node.name]);
            return i % 3 !== 1;
          });
          records.push([method, out(filtered), filterEvents, filtered.end() === selected]);
          records.push([method, out(selected[method](undefined, ':eq(2)'))]);
        }
        const retained = result.get();
        $(all[5]).remove();
        assert.deepEqual(result.get(), retained);
        records.push(out($([all[5], all[0]]).nextUntil('.stop')));
        return records;
      } finally { $.dispose?.(); }
    };
    assert.deepEqual(trace(load), trace(cheerio));
  });
}

test('until traversal does not suppress a repeated-node stop callback', () => {
  const $ = load('<main><p id="a"></p><p id="b"></p><p id="c"></p></main>');
  try {
    const a = $('#a')[0], visits = [];
    const selected = $([a, a]);
    const result = selected.nextUntil(function () {
      visits.push(this.attribs.id);
      return false;
    });
    assert.deepEqual(visits, ['b', 'c', 'b', 'c']);
    assert.deepEqual(result.get().map(node => node.attribs.id), ['b', 'c']);
  } finally { $.dispose(); }
});

test('until traversal observes disposal inside a stop callback', () => {
  const $ = load('<main><p id="a"></p><p></p><p></p></main>');
  let calls = 0;
  assert.throws(() => $('#a').nextUntil(function () {
    calls++;
    $.dispose();
    return false;
  }), { code: 'ERR_GROVEDOM_DISPOSED' });
  assert.equal(calls, 1);
  $.dispose();
});
