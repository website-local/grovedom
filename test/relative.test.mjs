import test from 'node:test';
import assert from 'node:assert/strict';
import { load, contains, merge } from '../src/index.js';
import { load as cheerio } from 'cheerio';

test('relative selectors keep context, order, escaped tokens and pending writes', () => {
  const source = '<main><div id="a"><i data-x="a > b">A</i><p><b>B</b></p></div><div id="c"><b>C</b></div><div id="d">D</div></main>';
  const $ = load(source), c = cheerio(source);
  try {
    $('#a').append('<i>E</i>'); c('#a').append('<i>E</i>');
    for (const selector of [':scope', ':scope#a', '> i', '> p > b', '> p b', '> [data-x="a > b"]', '> :is(i, p)', '+ div b', '~ div', '> i, > p', ':scope > i']) {
      assert.deepEqual($('#a').find(selector).map((i, n) => $(n).text()).get(), c('#a').find(selector).map((i, n) => c(n).text()).get(), selector);
    }
    assert.deepEqual($('div').find('> b').map((i, n) => $(n).text()).get(), c('div').find('> b').map((i, n) => c(n).text()).get());
    assert.throws(() => $('#a').find('> i, + div'), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
    assert.equal($(':scope').length, c(':scope').length);
    assert.equal($('> html').length, c('> html').length);
  } finally { $.dispose(); }
});

test('UTF-8 Buffer loading matches Cheerio load', () => {
  const source = Buffer.from('<p>🪴 汉字 &amp; text</p>');
  const $ = load(source);
  try { assert.equal($.html(), cheerio(source).html()); }
  finally { $.dispose(); }
});

test('insertBefore/After return clones and keep original handles detached', () => {
  for (const method of ['insertBefore', 'insertAfter']) {
    const $ = load('<main><p>A</p><i>target</i><i>other</i></main>');
    try {
      const original = $('p'), node = original[0], inserted = original[method]('i');
      assert.equal(inserted.length, 2);
      assert.notEqual(inserted[0], node);
      assert.notEqual(inserted[0], inserted[1]);
      assert.equal(node.parent, null);
      assert.equal(inserted.end(), original);
      assert.equal(original.text(), 'A');
    } finally { $.dispose(); }
  }
});

test('selection splice and merge preserve independent snapshots and node identity', () => {
  const $ = load('<main><p>A</p><p>B</p><p>C</p></main>'), other = load('<p>other</p>');
  try {
    const all = $('p'), original = all.toArray(), first = all.first();
    const removed = all.splice(0, 2, original[2]);
    assert.deepEqual(removed, original.slice(0, 2));
    assert.deepEqual(all.toArray(), [original[2], original[2]]);
    assert.equal(first[0], original[0]);
    assert.equal(merge(all, first), all);
    assert.deepEqual(all.toArray(), [original[2], original[2], original[0]]);
    assert.equal($('p').text(), 'ABC');
    assert.equal(contains($('main')[0], original[1]), true);
    assert.equal(contains($('main')[0], other('p')[0]), false);
    assert.equal($.contains($('main')[0], other('p')[0]), false);
    assert.equal(contains(original[0], original[0]), false);
  } finally { $.dispose(); other.dispose(); }
});
