import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

for (const xml of [false, true]) for (const execution of ['buffered', 'direct']) {
  test(`tag predicates preserve snapshots, mutations and selector fallbacks: ${xml ? 'XML' : 'HTML'}, ${execution}`, () => {
    const trace = loader => {
      const $ = loader('<main><a id="a">first</a><iframe id="f"></iframe><svg><linearGradient id="g"/></svg><p id="p">last</p></main>',
        { ...(xml ? { xml: true } : {}), ...(loader === load ? { execution } : {}) });
      try {
        const selected = $('#a, #f, #g, #p'), single = $('#a');
        const observe = () => ['', 'a', 'A', 'iframe', 'linearGradient', 'lineargradient', 'future-tag', 'p:first', 'p:last', 'p:eq(0)', ':is(a,p)', '*', '#a']
          .map(selector => [selected.is(selector), single.is(selector), $('missing').is(selector)]);
        const result = [observe()];
        single.attr('class', 'pending');
        result.push(single.is('a'), single.attr('class'));
        single[0].name = 'future-tag';
        result.push(observe());
        selected.remove();
        result.push(observe(), single.is('main a'));
        $.dispose?.();
        if (loader === load) assert.throws(() => single.is('a'), { code: 'ERR_GROVEDOM_DISPOSED' });
        return result;
      } finally { $.dispose?.(); }
    };
    assert.deepEqual(trace(load), trace(cheerio));
  });
}
