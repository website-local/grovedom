import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

// Cheerio 1.2.0 _makeDomArray uses parse5's default template fragment context;
// html(value) instead parses in the destination element's context.
const fixtures = [
  ['select', '<select><option>A</option></select>', 'select', '<li>X</li>'],
  ['table', '<table><tbody><tr><td>A</td></tr></tbody></table>', 'table', '<tr><td>B</td></tr>'],
  ['option siblings', '<select><option>A</option><option>B</option></select>', 'option', '<li>X</li>'],
  ['table cell siblings', '<table><tr><td>A</td></tr></table>', 'td', '<td>B</td>'],
  ['foreign content', '<svg><text>A</text></svg>', 'svg', '<style>&lt;b&gt;&amp;</style>'],
  ['MathML content', '<math><mi>A</mi></math>', 'math', '<annotation-xml><b>B</b></annotation-xml>'],
];
for (const execution of ['buffered', 'direct']) test(`insertion strings use Cheerio's default fragment context (${execution})`, () => {
  for (const [name, source, selector, markup] of fixtures) for (const method of ['append', 'prepend', 'before', 'after', 'html']) {
    const $ = load(source, { execution }), expected = cheerio(source);
    try {
      const retained = $(selector), reference = expected(selector);
      retained[method](markup); reference[method](markup);
      assert.equal($.html(), expected.html(), name + '.' + method);
      assert.deepEqual(retained.get().map(n => n.name), reference.get().map(n => n.name));
      assert.equal(retained.text(), reference.text());
    } finally { $.dispose(); }
  }
});

test('detached insertion fragments retain table markup and independent lifetimes', () => {
  const $ = load('<main/>'), expected = cheerio('<main/>');
  try {
    for (const markup of ['<tr><td>X</td></tr>', '<option>X</option>', '<col>', '<template><i>X</i></template>']) {
      assert.equal($(markup).toString(), expected(markup).toString());
      $('main').empty().append(markup); expected('main').empty().append(markup);
      assert.equal($.html(), expected.html());
    }
  } finally { $.dispose(); }
});
