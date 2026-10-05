import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const source = '<main id="m"><div id="d"><section id="s"><p id="p" class="a">one<b id="b">bold</b></p><p id="q">two</p></section></div><p id="tail"></p><template id="t"><p id="inside"></p></template></main>';
const ids = ($, selection) => selection.toArray().map(node => $(node).attr('id'));
for (const xml of [false, true]) {
  test(`scoped find bounds ancestry while retaining root position and sibling tests, xml=${xml}`, () => {
    const options = xml ? { xml: true } : {}, $ = load(source, options), c = cheerio(source, options);
    const queries = ['main p', 'div p', ':last-child p', ':first-child p', ':is(main p)', ':not(main p)',
      ':where(main p)', ':is(main) p', ':has(+ p) p', ':has(> section) p', 'div:has(+ p) p',
      ':is(div, main) p', 'main > div p', 'p + p', ':not(:has(+ p)) p'];
    try {
      for (const context of ['#d', '#s', '#d, #s', '#s, #d', 'main, #s', 'template'])
        for (const selector of queries)
          assert.deepEqual(ids($, $(context).find(selector)), ids(c, c(context).find(selector)), `${context}: ${selector}`);
      assert.deepEqual(ids($, $('#d').find('main p')), []);
      assert.deepEqual(ids($, $('#d').find('div:has(+ p) p')), ['p', 'q']);
      assert.equal($('#p').is('main p'), true, 'filter/is use the full ancestry');
      for (const dom of [$, c]) dom('#s').remove();
      for (const selector of queries)
        assert.deepEqual(ids($, $('#d').find(selector)), ids(c, c('#d').find(selector)), 'after removal: ' + selector);
    } finally { $.dispose(); }
  });
  test(`has retries nested list predicates across descendants, xml=${xml}`, () => {
    const options = xml ? { xml: true } : {}, $ = load(source, options), c = cheerio(source, options);
    const queries = [':has(:not(.a))', ':has(:where(p, div))', ':has(:is(p, section))',
      'main:has(:not(.missing))', ':has(> :not(.a))', ':has(+ :is(p, template))',
      ':has(:not(main p))', ':has(section :is(main p))', ':has(:has(b))'];
    try {
      for (const selector of queries) {
        assert.deepEqual(ids($, $(selector)), ids(c, c(selector)), selector);
        assert.deepEqual(ids($, $('#d').find(selector)), ids(c, c('#d').find(selector)), 'scoped: ' + selector);
      }
    } finally { $.dispose(); }
  });
  test(`explicit context order removes covered roots but preserves disjoint scopes, xml=${xml}`, () => {
    const trace = loader => {
      const $ = loader('<main><section id="left"><p id="a"></p></section><section id="right"><p id="b"></p></section></main>', xml ? { xml: true } : {});
      try {
        return [['#right', '#left'], ['#right', 'main'], ['main', '#right'], ['#right', '#right', '#left']]
          .map(roots => ['p', 'section p', ':not(main p)'].map(selector =>
            ids($, $(roots.map(root => $(root)[0])).find(selector))));
      } finally { $.dispose?.(); }
    };
    assert.deepEqual(trace(load), trace(cheerio));
    assert.deepEqual(trace(load)[1][0], ['a', 'b']);
  });
}
