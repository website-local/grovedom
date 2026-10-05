import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

test('is observes queued mutations, selection-relative selectors and retained snapshots', () => {
  const source = '<main><i class="first"></i><i></i></main>', $ = load(source), c = cheerio(source);
  try {
    const selected = $('i'), reference = c('i');
    selected.last().attr('data-state', 'ready'); reference.last().attr('data-state', 'ready');
    for (const selector of ['i', '[data-state=ready]', ':first', ':eq(1)', ':not(.first)', 'main > i', '', '.missing'])
      assert.equal(selected.is(selector), reference.is(selector), selector);
    selected.first().remove(); reference.first().remove();
    assert.equal(selected.is('.first'), reference.is('.first'));
    assert.equal(selected.end().length, reference.end().length);
    const actual = [], expected = [];
    assert.equal(selected.is(function (i, n) { actual.push([i, this === n]); return i === 0; }),
      reference.is(function (i, n) { expected.push([i, this === n]); return i === 0; }));
    assert.deepEqual(actual, expected);
    assert.throws(() => selected.is('['), { code: 'ERR_GROVEDOM_SELECTOR' });
    assert.equal(selected.is('i'), true);
    $.dispose();
    assert.throws(() => selected.is(''), { code: 'ERR_GROVEDOM_DISPOSED' });
  } finally { $.dispose(); }
});

test('query end and addBack preserve explicit contexts and independent snapshots', () => {
  const source = '<main><i></i></main>', $ = load(source), c = cheerio(source);
  try {
    for (const kind of ['default', 'string', 'selection', 'node']) {
      const query = open => open('i', kind === 'default' ? undefined : kind === 'string' ? 'main'
        : kind === 'selection' ? open('main') : open('main')[0]);
      const a = query($), b = query(c);
      const shape = value => value.toArray().map(n => [n.type, n.name]);
      assert.deepEqual(shape(a.end()), shape(b.end()), kind);
      assert.deepEqual(shape(a.end().end()), shape(b.end().end()), kind + ' repeated');
      assert.deepEqual(shape(a.addBack()), shape(b.addBack()), kind + ' addBack');
      assert.equal(a.end(), a.end());
    }
    const context = $('main');
    assert.equal($('i', context).end(), context);
    assert.notEqual($('i').end(), $('i').end());
    assert.equal($('missing').end().length, c('missing').end().length);
  } finally { $.dispose(); }
});
