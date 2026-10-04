import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';
import { kernel } from '../diagnostics/kernel.js';

const html = '<main><h2>Title</h2><section id="a">ab<b>cd</b><br>ef<!--gap--></section><section id="b">other</section><template id="t"><i>inside</i></template><form><input name="a"><input type="text"><input type="checkbox" checked><input type="radio"><button>send</button><select><option>one</option><option>two</option></select><textarea>value</textarea></form><p data-value=":input">:input</p></main>';
for (const execution of ['direct', 'buffered']) test(`${execution}: common Cheerio pseudos compose with CSS and nested functions`, () => {
  const $ = load(html, { execution }), c = cheerio(html);
  try {
    for (const selector of [':input', 'input:text', ':header', ':button', ':checkbox', ':radio', ':selected', ':parent', ':contains(abcd)', ':contains("cd\\a ef")', 'section:contains(abcd)+section', 'main:has(section:contains(abcd))', ':not(:contains(inside))', ':is(:input,:header)', 'form:has(:input)', ':input:not(:checkbox)', '[data-value=":input"]', 'p:contains(:input)', 'template:contains(inside)', ':contains("")', 'section:contains(abcd):first']) {
      const values = dom => dom(selector).map((_, node) => node.name + ':' + (node.attribs.id ?? '')).get();
      assert.deepEqual(values($), values(c), selector);
      assert.deepEqual($('*').filter(selector).map((_, n) => n.name).get(), c('*').filter(selector).map((_, n) => n.name).get(), 'filter ' + selector);
    }
    $('b').text('changed'); c('b').text('changed');
    assert.equal($('section:contains(abchanged)').length, c('section:contains(abchanged)').length);
  } finally { $.dispose(); }
});

test('XML text predicates span CDATA and preserve name case', () => {
  const html = '<Root><Item>a<![CDATA[b]]><B>c</B></Item><item>d</item></Root>';
  const $ = load(html, { xml: true }), c = cheerio(html, { xml: true });
  try { assert.deepEqual($('Item:contains(abc)').map((_, n) => n.name).get(), c('Item:contains(abc)').map((_, n) => n.name).get()); }
  finally { $.dispose(); }
});

test('selector cache churn and text scratch reuse plateau and dispose cleanly', () => {
  const $ = load(html);
  function cycle() {
    for (let i = 0; i < 96; i++) {
      $(`section:contains(abcd):not([data-unused="${i}"])`);
      $('main:has(template):not(:empty)');
    }
  }
  try {
    for (let i = 0; i < 10; i++) cycle();
    const before = kernel.stats().liveBytes;
    for (let i = 0; i < 30; i++) cycle();
    assert.equal(kernel.stats().liveBytes, before);
  } finally { $.dispose(); }
  assert.equal(kernel.stats().liveBytes, 0);
});

test('compatibility selector depth fails safely and leaves the document usable', () => {
  const $ = load('<template><p>text</p></template>');
  try {
    assert.throws(() => $(':is('.repeat(100) + ':contains(text)' + ')'.repeat(100)), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
    assert.equal($('p:contains(text)').text(), 'text');
    assert.equal($('p')[0].parent.parent.name, 'template');
  } finally { $.dispose(); }
});
