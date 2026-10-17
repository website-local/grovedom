import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

for (const execution of ['buffered', 'direct']) {
  test(`explicit query roots inside templates survive covered-root removal, ${execution}`, () => {
    const source = '<main id="outer"><section id="before"><b id="a">a</b></section>' +
      '<template id="t"><section id="inside"><span id="b">b</span><template>' +
      '<section id="nested"><b id="c">c</b></section></template></section></template>' +
      '<section id="after"><b id="d">d</b></section></main>';
    const trace = factory => {
      const $ = factory(source, { execution });
      const ids = value => value.get().map(node => $(node).attr('id') ?? node.name);
      const one = selector => $(selector)[0], outer = one('#outer'), inside = one('#inside'), nested = one('#nested');
      const roots = [[outer, inside], [inside, outer], [outer, inside, nested],
        [nested, inside, outer, inside], [one('#before'), inside, nested, one('#after')],
        [$.root()[0], inside, nested], [inside.parent, outer, nested]];
      const records = [];
      try {
        for (const list of roots) for (const selector of ['b', 'span, b', 'section > b', ':is(span,b)', 'b, span, a, entry, text'])
          records.push(ids($(list).find(selector)));
        // Reparenting changes which roots can cover others. Retained roots keep
        // their identity; the original template no longer supplies that subtree.
        $(outer).append(inside);
        for (const list of roots.slice(0, 5)) for (const selector of ['b', 'span, b', 'section > b'])
          records.push(ids($(list).find(selector)));
        $(inside).remove();
        records.push(ids($([outer, nested, inside]).find('b, span')));
        return records;
      } finally { $.dispose?.(); }
    };
    assert.deepEqual(trace(load), trace(cheerio));
  });

  test('template root combinations preserve matches and preorder, ' + execution, () => {
    const source = '<main id="main"><section id="s"><template id="t"><div id="div">' +
      '<section id="inner"><b id="a"></b><template id="nested"><b id="b"></b></template>' +
      '</section></div></template><b id="c"></b></section><b id="d"></b></main>';
    const $ = load(source, { execution }), reference = cheerio(source);
    const roots = api => Object.fromEntries([
      ['root', api.root()[0]],
      ...['main', 's', 't', 'div', 'inner', 'a', 'nested', 'b', 'c', 'd'].map(id => [id, api('#' + id)[0]]),
      ['fragment', api('#t').contents()[0]], ['nestedFragment', api('#nested').contents()[0]],
    ]);
    const selectors = ['b', '[id]', '*', ':not(.missing)', 'section b',
      'b:not(main b)', ':has(> b) b', ':is(b,section)', 'b + template', 'section > b',
      '> b, span', 'span, > b', '> [id], b', 'b, > [id]'];
    try {
      const actual = roots($), expected = roots(reference), names = Object.keys(actual);
      for (const a of names) for (const b of names) for (const selector of selectors) {
        const read = (api, nodes) => api([nodes[a], nodes[b], nodes[a]]).find(selector).get().map(node => node.attribs.id);
        assert.deepEqual(read($, actual), read(reference, expected), a + ', ' + b + ': ' + selector);
      }
      assert.equal($.html(), reference.html(), 'Queries must leave the connected tree unchanged');
    } finally { $.dispose(); }
  });
}
