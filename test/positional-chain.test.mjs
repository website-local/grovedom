import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const html = '<main>' + Array.from({ length: 8 }, (_, i) => `<p id="p${i}">${i}</p>`).join('') + '</main>';
const ids = selection => selection.map((_, node) => node.attribs.id).get();

for (const execution of ['buffered', 'direct']) test(`${execution}: positional suffix chains preserve order, scope and snapshots`, () => {
  const $ = load(html, { execution }), reference = cheerio(html);
  try {
    const retained = $('p'), expected = reference('p');
    retained.attr('data-ready', 'yes');
    expected.attr('data-ready', 'yes');
    for (const suffix of [':first:last', ':last:first', ':gt(0):lt(6):even:last',
      ':odd:eq(-2)', ':nth(4):gt(-2)', ':lt(0):first', ':gt(-99):lt(99):odd']) {
      const selected = expected.filter(suffix);
      assert.deepEqual(ids(retained.filter(suffix)), ids(selected), suffix);
      assert.deepEqual(ids($('p[data-ready=yes]' + suffix, $('main'))), ids(selected), suffix);
      assert.equal(retained.is(suffix), selected.length > 0, suffix);
    }
    assert.deepEqual(ids(retained), ids(expected), 'filtering must preserve the original snapshot');
  } finally { $.dispose(); }
});

test('long positional chains complete without recursive stack growth', () => {
  const $ = load(html);
  try {
    const retained = $('p');
    retained.attr('data-ready', 'yes');
    const suffix = ':first'.repeat(10_000);
    assert.equal($('p[data-ready=yes]' + suffix).attr('id'), 'p0');
    assert.deepEqual(ids(retained.filter(suffix)), ['p0']);
    assert.equal(retained.is(suffix), true);
    assert.equal(retained.length, 8);
    assert.equal($('p:last').attr('id'), 'p7');
  } finally { $.dispose(); }
});
