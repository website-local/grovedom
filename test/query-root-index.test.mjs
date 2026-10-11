import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

for (const xml of [false, true]) {
  for (const execution of ['buffered', 'direct']) {
    test(`multi-root queries preserve caller order through duplicates, edits and sorts, xml=${xml}, ${execution}`, () => {
      const trace = loader => {
        const $ = loader('<main>' + Array.from({ length: 320 }, (_, i) =>
          `<section id="s${i}"><div><b id="b${i}">value</b></div></section>`).join('') + '</main>', { xml, execution });
        try {
          const roots = $('section').get(), records = [];
          const output = selection => selection.get().map(node => $(node).attr('id'));
          const lists = [roots, [...roots].reverse(), [roots[5], roots[1], roots[8], roots[5]],
            roots.filter((_, i) => i % 3 === 0), [roots[7], $('main')[0], roots[1]]];
          for (const list of lists) for (const selector of ['b', 'div > b', 'section b', ':is(section) b', ':not(main b)', 'div:has(> b) b'])
            records.push(output($(list).find(selector)));

          // Reuse roots in a different order after detached-tree sorting has
          // borrowed the same native scratch field. Existing handles stay live.
          $(roots[0]).remove();
          $(roots[2]).remove();
          records.push(output($(roots[2]).add(roots[0]).add(roots[1])));
          records.push(output($([roots[2], roots[0], roots[1], roots[2]]).find('div > b')));
          $(roots[4]).append(roots[6]);
          records.push(output($([roots[6], roots[4], roots[5], roots[4]]).find('b')));
          records.push(output($([roots[4], roots[6]]).find(':is(section) b')));
          records.push(output($([roots[5], roots[3]]).find('main b')));

          // A later template switches the document to its fragment-aware path.
          $('main').append('<template><i id="inside">template</i></template>');
          records.push(output($([roots[8], roots[3], roots[8]]).find('b')));
          records.push(output($('main').find('template')));
          return records;
        } finally { $.dispose?.(); }
      };
      assert.deepEqual(trace(load), trace(cheerio));
    });
  }
}
