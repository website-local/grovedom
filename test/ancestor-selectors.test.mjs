import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

for (const xml of [false, true]) test(`list pseudo-classes retry earlier ancestors and siblings, xml=${xml}`, () => {
  const source = '<main class="top"><section><i id="deep"></i></section><i id="direct"></i><aside><b></b><i id="side"></i></aside></main><svg><defs><g id="foreign"></g></defs></svg>';
  const options = xml ? { xml: true } : {}, $ = load(source, options), c = cheerio(source, options);
  const selectors = [':is(main) [id]', ':where(main,svg) [id]', ':not(section) [id]', ':not(:not(main)) [id]',
    ':is(main,section) [id]', ':is(main).top [id]', ':has(>section) [id]', ':is(svg,math) [id]',
    ':is(main) > [id]', ':is(section) ~ aside [id]', ':not(b) ~ aside [id]', ':is(section) + [id]',
    'main:has(:is(aside) [id])', ':not(:is(main) [id])'];
  try {
    for (const selector of selectors) {
      assert.deepEqual($(selector).toArray().map(n => [n.name, n.attribs.id]), c(selector).toArray().map(n => [n.name, n.attribs.id]), selector);
      for (const id of ['deep', 'direct', 'side', 'foreign']) assert.equal($('#' + id).is(selector), c('#' + id).is(selector), id + ': ' + selector);
    }
  } finally { $.dispose(); }
});
