import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

for (const execution of ['buffered', 'direct']) {
  test(`HTML attribute output preserves every ASCII byte, entities and Unicode, ${execution}`, () => {
    const source = '<main><a></a><svg><image xlink:href="old" xml:lang="en"/></svg></main>';
    const $ = load(source, { execution }), c = cheerio(source);
    const values = ['', '&lt;&gt;&amp;&quot;&nbsp;', '< > & " \' \u00a0',
      Array.from({ length: 128 }, (_, i) => String.fromCharCode(i)).join(''),
      '\ufeffé¢\u00a0\u00a0😀𐀀', 'plain'.repeat(3300), '&"\u00a0<>😀'.repeat(2100)];
    try {
      for (const value of values) {
        for (const open of [$, c]) {
          open('a').attr('title', value).attr('data-empty', '').attr('data-' + 'n'.repeat(1300), value);
          open('image').attr('href', value).attr('lang', value);
        }
        assert.equal($.html(), c.html());
        assert.equal($('main').html(), c('main').html());
        assert.equal($('a').prop('outerHTML'), c('a').prop('outerHTML'));
        assert.equal($.xml(), c.xml());
      }
    } finally { $.dispose(); }
  });

  test(`HTML attributes retain UTF-8 replacement for lone surrogates, ${execution}`, () => {
    const $ = load('<p></p>', { execution });
    try {
      $('p').attr('title', '\ud800 & \udfff');
      assert.equal($('p').prop('outerHTML'), '<p title="\ufffd &amp; \ufffd"></p>');
    } finally { $.dispose(); }
  });

  test(`HTML opening tags preserve namespaces and attribute order after edits, ${execution}`, () => {
    const source = '<button is="custom-button" disabled title="&quot;&amp;&nbsp;&lt;&gt;"></button>' +
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="urn:links">' +
      '<image xlink:href="one" xml:lang="en" viewBox="0 0 2 2"/>' +
      '<foreignObject><p data-x="&lt;a&gt;">inside</p></foreignObject></svg>' +
      '<math><mi xml:lang="zh" xlink:href="two">x</mi></math>' +
      '<template><a title="&lt;b&gt;"></a><template><i title="&amp;"></i></template></template>';
    const $ = load(source, { execution }), c = cheerio(source);
    try {
      assert.equal($.html(), c.html());
      for (const open of [$, c]) {
        open('button').removeAttr('is').attr('title', '<>&"\u00a0');
        open('image').removeAttr('href lang').attr('href', '<>&"\u00a0').attr('lang', 'fr');
        open('svg').append(open('image').clone());
        open('p').attr('xml:lang', 'literal').attr('xmlns', 'literal-namespace');
        open('template').first().attr('data-after', 'value');
      }
      assert.equal($.html(), c.html());
      assert.equal($.xml(), c.xml());
      assert.equal($('svg').prop('outerHTML'), c('svg').prop('outerHTML'));
    } finally { $.dispose(); }
  });
}
