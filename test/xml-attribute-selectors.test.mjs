import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const source = '<Root><Group id="g"><Item id="a" Code="AbC" code="lower-tail" empty="" tokens="Alpha&#xA0;β Γ" p:Key="Namespaced" Δ="δ"><Leaf id="leaf"/></Item><Item id="b" Code="other"/><Item id="c"/></Group></Root>';
const ids = ($, selector) => $(selector).get().map(node => $(node).attr('id') ?? node.name);

test('nested XML attribute predicates preserve names, operators and value modifiers', () => {
  const $ = load(source, { xml: true }), reference = cheerio(source, { xml: true });
  const clauses = ['[Code]', '[code]', '[CODE]', '[missing]', '[empty]', '[empty=""]',
    '[empty^=""]', '[empty$=""]', '[empty*=""]', '[Code="AbC"]', '[Code="abc" i]',
    '[Code="abc" s]', '[Code^="ab" i]', '[Code$="BC" i]', '[Code*="B" s]',
    '[code|="lower"]', '[tokens~="β"]', '[tokens~="γ" i]', '[tokens~="γ" s]',
    '[p\\:Key="Namespaced"]', '[p\\:key]', '[Δ="δ"]', '[not-yet-interned]'];
  try {
    for (const clause of clauses) {
      for (const selector of [`Group:has(> ${clause})`, `:is(${clause}) > Leaf`,
        `:not(:not(${clause})) > Leaf`, `Root:has(Group:has(${clause}))`])
        assert.deepEqual(ids($, selector), ids(reference, selector), selector);
      assert.equal($('#g').is(`:has(> ${clause})`), reference('#g').is(`:has(> ${clause})`), clause);
    }
    assert.deepEqual(ids($, 'Group:has(> [Code="abc" i])'), ['g']);
    assert.deepEqual(ids($, 'Group:has(> [Code="abc" s])'), []);
    assert.deepEqual(ids($, ':is([p\\:Key]) > Leaf'), ['leaf']);
  } finally { $.dispose(); }
});

for (const execution of ['direct', 'buffered']) test(`${execution}: XML attribute predicates observe mutations and preserve snapshots`, () => {
  const trace = loader => {
    const $ = loader(source, { xml: true, execution });
    try {
      const group = $('#g'), selected = group.children(), handles = selected.get(), events = [];
      const query = () => ids($, 'Group:has(> [fresh="yes"])');
      events.push(query());
      $('#b').attr('fresh', 'yes');
      events.push(query());
      selected.attr('Code', function (index, old) {
        events.push([index, old ?? null, this === handles[index], ids($, 'Group:has(> [Code="changed"])')]);
        return 'changed';
      });
      events.push(ids($, 'Group:has(> [Code="changed"])'));
      $('#b').removeAttr('fresh');
      events.push(query());
      $('#c').attr('fresh', 'yes').attr('p:Key', 'late');
      events.push(query(), ids($, 'Group:has(> [p\\:Key="late"])'));
      selected.eq(0).remove();
      events.push(selected.get().map((node, i) => node === handles[i]),
        selected.filter(':has(> Leaf)').get().map(node => $(node).attr('id')),
        group.find(':is([Code]) > Leaf').length, $.xml());
      return events;
    } finally { $.dispose?.(); }
  };
  assert.deepEqual(trace(load), trace(cheerio));
});
