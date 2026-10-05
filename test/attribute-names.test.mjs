import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

// jQuery attributes.js gh-3003 distinguishes HTML whitespace from other Unicode
// whitespace. Cheerio also permits these names in attr(); its removeAttr() token
// splitting is a separate compatibility difference, not exercised here.
for (const execution of ['buffered', 'direct']) for (const xml of [false, true]) {
  test(`${execution} ${xml ? 'XML' : 'HTML'}: non-ASCII whitespace remains part of attribute names`, () => {
    const source = '<div data-\u00a0="first" data-a\u2003b="second"></div>';
    const $ = load(source, { execution, xml }), c = cheerio(source, { xml });
    try {
      const node = $('div'), other = c('div');
      for (const name of ['data-\u00a0', 'data-a\u2003b', 'data-\ufeff']) {
        assert.equal(node.attr(name), other.attr(name));
        node.attr(name, (_, old) => (old ?? '') + '!');
        other.attr(name, (_, old) => (old ?? '') + '!');
        assert.equal(node.attr(name), other.attr(name));
        assert.equal(node[0].attribs[name], other[0].attribs[name]);
        node.attr(name, null); other.attr(name, null);
        assert.equal(node.attr(name), undefined);
      }
      assert.equal($.html(), c.html());
    } finally { $.dispose(); }
  });
}

test('attribute-name validation still rejects HTML delimiters and leaves the document usable', () => {
  const $ = load('<p data-valid="yes"></p>');
  try {
    for (const name of ['a b', 'a\tb', 'a\nb', 'a\rb', 'a\fb', 'a\0b', 'a"b', "a'b", 'a>b', 'a<b', 'a/b', 'a=b'])
      assert.throws(() => $('p').attr(name, 'bad'), TypeError);
    assert.equal($('p').attr('data-valid'), 'yes');
  } finally { $.dispose(); }
});
