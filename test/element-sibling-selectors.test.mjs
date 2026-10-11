import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const selectors = [':first-child', ':last-child', ':only-child', ':nth-child(1)',
  ':nth-child(2n)', ':nth-child(2n+1)', ':nth-child(-n+2)', ':nth-last-child(1)',
  ':nth-last-child(2n)', ':first-of-type', ':last-of-type', ':nth-of-type(2n)',
  ':is(:nth-child(2n))', ':not(:first-child)', '*:nth-child(2n)'];
for (const xml of [false, true]) for (const execution of ['buffered', 'direct']) {
  test(`structural selectors count element siblings, xml=${xml}, ${execution}`, () => {
    const source = xml
      ? '<?xml version="1.0"?><!DOCTYPE Root><!--before--><Root id="root"><Item id="a"/><?between data?><![CDATA[text]]><Item id="b"/><!--end--></Root><?after data?>'
      : '<!doctype html><!--before--><html id="root"><head></head><body><main id="a">text<!--between--><p id="b"></p><p id="c"></p></main></body></html><!--after-->';
    const trace = factory => {
      const $ = factory(source, { xml, execution });
      const ids = value => value.get().map(node => [node.name, $(node).attr('id') ?? null]);
      try {
        const records = selectors.map(selector => [selector, ids($(selector)), ids($('*').filter(selector))]);
        const retained = $('#a, #b');
        for (const selector of selectors) records.push([selector, ids($('#root').find(selector)), retained.is(selector)]);
        $('#a').after(xml ? '<?inserted data?><Item id="added"/>' : '<!--inserted--><section id="added"></section>');
        for (const selector of selectors) records.push([selector, ids($(selector))]);
        return records;
      } finally { $.dispose?.(); }
    };
    assert.deepEqual(trace(load), trace(cheerio));
  });
}
