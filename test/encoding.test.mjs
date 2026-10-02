import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../src/index.js';
import { load as cheerio } from 'cheerio';

test('short ASCII operands and Unicode fallback preserve payload offsets', () => {
  for (const execution of ['buffered', 'direct']) {
    const $ = load('<p></p><i></i>', { execution }), expected = cheerio('<p></p><i></i>');
    try {
      for (const value of ['', 'a<&"b', '<>', '&lt;&gt;', '\u00a0', 'a'.repeat(63), 'b'.repeat(64), 'c'.repeat(65), 'abcé', '你好😀', 'a'.repeat(63) + 'é', 'x\0y']) {
        $('p').attr('data-value', value).attr('title', 'following').text(value);
        expected('p').attr('data-value', value).attr('title', 'following').text(value);
        $('i').attr('data-tail', 'tail'); expected('i').attr('data-tail', 'tail');
        assert.equal($('p').attr('data-value'), expected('p').attr('data-value'));
        assert.equal($('p').text(), expected('p').text());
        assert.equal($('p').attr('title'), 'following');
        assert.equal($('i').attr('data-tail'), 'tail');
        assert.equal($.html(), expected.html());
      }
    } finally { $.dispose(); }
  }
});

test('attribute escaping preserves names, literal entities, and foreign content', () => {
  const source = '<main &lt;="&amp;lt;" title="<canvas> &amp; &quot;"><svg><text data-x="&lt;&gt;">&lt;&gt;</text></svg></main>';
  const $ = load(source);
  try { assert.equal($.html(), cheerio(source).html()); }
  finally { $.dispose(); }
});
