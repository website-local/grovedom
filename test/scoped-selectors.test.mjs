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
  test(`wide context snapshots survive duplicate roots, queries and reparenting, xml=${xml}`, () => {
    const trace = loader => {
      const $ = loader('<main>' + Array.from({ length: 160 }, (_, i) =>
        `<section id="s${i}"><div><b id="b${i}"></b></div></section>`).join('') + '</main>', xml ? { xml: true } : {});
      try {
        const sections = $('section').get().reverse();
        const roots = $([...sections, ...sections.slice(0, 4)]);
        const before = roots.find('b');
        const result = [ids($, before), ids($, roots.find('[id]')), ids($, roots.find('missing'))];
        // Selection identity and supplied root order remain independent of the
        // kernel's temporary result marks and later parent/child relationships.
        $('#s0').append($('#s159'));
        result.push(ids($, roots.find('b')), ids($, roots.find('div > b')),
          ids($, roots.find('section b')), ids($, roots.find(':has(> b) b')),
          ids($, roots.find('b:not(main b)')),
          ids($, before), ids($, roots.filter('section')),
          ids($, roots.find('b')), ids($, roots));
        const detached = $('#s80').remove();
        result.push(ids($, roots.find('b')), ids($, $([detached[0], $('main')[0], detached[0]]).find('b')));
        return result;
      } finally { $.dispose?.(); }
    };
    assert.deepEqual(trace(load), trace(cheerio));
  });
}

for (const execution of ['buffered', 'direct']) {
  test('template queries preserve the union of scopes and root order, ' + execution, () => {
    const markup = '<main><section id="s"><template id="t"><div><section id="inner"><b id="a"></b><template><b id="b"></b></template></section></div></template><b id="c"></b></section><b id="d"></b></main>';
    const $ = load(markup, { execution }), reference = cheerio(markup);
    const contexts = api => {
      const main = api('main')[0], section = api('#s')[0], inner = api('#inner')[0], fragment = api('#t').contents()[0];
      return [[fragment, main, fragment], [main, fragment, main], [fragment, section, fragment],
        [inner, section, inner], [section, inner], [api('#t')[0], inner], [inner, api('#t')[0]],
        [inner, api('#d')[0], inner]];
    };
    try {
      const actual = contexts($), expected = contexts(reference);
      for (let index = 0; index < actual.length; index++)
        for (const selector of ['b', '[id]', ':not(.missing)', 'section b', 'b:not(main b)', ':has(> b) b', 'b', '[id]'])
          assert.deepEqual(ids($, $(actual[index]).find(selector)),
            ids(reference, reference(expected[index]).find(selector)), 'context ' + index + ': ' + selector);
      assert.deepEqual(ids($, $([$('#s')[0], $('#inner')[0]]).find('b')), ['a', 'c']);
      assert.equal($('#inner')[0].parent.parent.parent, $('#t')[0], 'Query must restore fragment parent links');
    } finally { $.dispose(); }
  });
}
