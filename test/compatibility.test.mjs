import test from 'node:test';
import assert from 'node:assert/strict';
import { load as cheerio } from 'cheerio';
import { load } from '../src/index.js';
import { documents, page, replay } from './fixtures.mjs';

for (const execution of ['buffered', 'direct']) {
  test(`${execution}: parser output, fragment mode, scripting defaults`, () => {
    for (const source of documents) for (const isDocument of [true, false]) for (const scriptingEnabled of [true, false]) {
      const $ = load(source, { execution, scriptingEnabled }, isDocument);
      const c = cheerio(source, { scriptingEnabled }, isDocument);
      try { assert.equal($.html(), c.html()); assert.equal($.text(), c.text()); }
      finally { $.dispose(); }
    }
  });

  test(`${execution}: selectors, traversal, list order and deduplication`, () => {
    const source = '<main><div id="a"><p id="b" class="x">B</p><p id="c">C</p></div><div id="d"><p id="e" class="x">E</p></div></main>';
    const $ = load(source, { execution }), c = cheerio(source);
    const ids = selection => Array.from(selection, node => node.name);
    try {
      for (const selector of ['p', '.x', 'div > p', 'p:nth-child(2)', 'p.x, p', 'main :is(p, div)', 'div:has(.x)', '#a + div']) {
        assert.deepEqual($(`${selector}`).toArray().map(node => $(node).attr('id')), c(selector).toArray().map(node => c(node).attr('id')), selector);
      }
      assert.equal($('p').is('.x'), c('p').is('.x'));
      assert.equal($('p').filter('.x').text(), c('p').filter('.x').text());
      assert.deepEqual(ids($('main').children()), ids(c('main').children()));
      assert.equal($('p').parent().length, c('p').parent().length);
      assert.equal($('main, div').find('p').length, c('main, div').find('p').length);
      assert.equal($('p', '#d').text(), c('p', '#d').text());
      assert.equal($('p').eq(-1).attr('id'), 'e');
      assert.equal($('p').slice(1).text(), 'CE');
      assert.equal($('missing').html(), null);
      assert.equal($('missing').text(), '');
    } finally { $.dispose(); }
  });

  test(`${execution}: getter/setter behavior and context-sensitive fragments`, () => {
    function transform(create) {
      const $ = create('<input disabled><div><p>one</p><p>two</p></div><table><tbody></tbody></table><select></select>');
      try {
        const disabled = $('input').attr('disabled');
        $('p').attr('title', (i, old) => `${i}-${old}`).attr('data-x', '🪴 汉字');
        $('p').text(function (i, old) { return `${old} & ${i}`; });
        $('div').append('<b>next</b>');
        $('tbody').html('<tr><td>cell</td></tr>');
        $('select').append('<option selected>x</option>');
        $('p').first().removeAttr('title data-x');
        $('input').attr('disabled', null);
        return { disabled, html: $.html(), text: $('div').text(), outer: $('table').prop('outerHTML') };
      } finally { $.dispose?.(); }
    }
    assert.deepEqual(transform(source => load(source, { execution })), transform(cheerio));
  });

  test(`${execution}: snapshots, retained nodes, callback order, and identity`, () => {
    const $ = load('<main><a id="old">old</a></main>', { execution });
    try {
      const snapshot = $('a'), node = snapshot[0];
      assert.equal(node, snapshot.get(0));
      assert.equal(node, $('a')[0]);
      $('main').append('<a id="new">new</a>');
      snapshot.remove();
      assert.equal($('a').attr('id'), 'new');
      assert.equal($(node).text(), 'old');
      const retained = $('main').contents();
      $('main').html('<p>replacement</p>');
      assert.equal(retained.text(), 'new');
      assert.equal(retained.parent().length, 0);
      $('main').html('<i>1</i><i>2</i><i>3</i>');
      const seen = [];
      $('i').each(function (i, el) {
        assert.equal(this, el);
        seen.push($(el).text());
        if (i === 0) $('i').eq(1).text('changed');
        return i < 1;
      });
      assert.deepEqual(seen, ['1', 'changed']);
      let predicates = 0;
      assert.equal($('i').is(function () { predicates++; return true; }), true);
      assert.equal(predicates, 1);
      const filtered = $('i').filter(function () { return this.type === 'tag'; });
      assert.equal(filtered.length, 3);
      assert.throws(() => $('???'), /selector/i);
      assert.equal($('p').length, 0);
    } finally { $.dispose(); }
  });

  test(`${execution}: synthetic DOM replay matches Cheerio`, () => {
    assert.equal(replay(source => load(source, { execution }), page(80)), replay(cheerio, page(80)));
  });
}

test('unsupported options and foreign nodes fail explicitly; markup and rename work', () => {
  assert.throws(() => load('<x/>', { xml: { onopentag() {} } }), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
  const a = load('<p>A</p>'), b = load('<p>B</p>');
  try {
    assert.throws(() => a(b('p')[0]), /another document/);
    assert.equal(a('<p>new</p>').text(), 'new');
    const node = a('p')[0];
    a('p').prop('tagName', 'div');
    assert.equal(a('div')[0], node);
    a('div').prop('tagName', 'p');
    assert.throws(() => a.html({ treeAdapter: {} }), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
    a('p').html('<template>x</template>');
    a.flush();
    assert.equal(a('p').text(), 'x');
  } finally { a.dispose(); b.dispose(); }
});
