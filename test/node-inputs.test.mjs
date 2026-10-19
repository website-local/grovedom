import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';
import { checkLinks } from './fuzz/execute.mjs';

function sameNodes(actual, expected) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) assert.equal(actual[i], expected[i]);
}

for (const thread of ['main', 'worker']) test(`repeated insertion traversal terminates on the ${thread} thread`, { timeout: 20000 }, () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./node-inputs-fixture.mjs', import.meta.url)), thread], {
    encoding: 'utf8', timeout: 15000, killSignal: 'SIGKILL', maxBuffer: 1024 * 1024,
  });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.signal, null, result.stderr);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /completed safely/);
});

for (const execution of ['buffered', 'direct']) for (const xml of [false, true]) {
  const options = { execution, xml };
  test(`existing-node insertions keep links, identities and cycle guards (${execution}, xml=${xml})`, () => {
    for (const method of ['append', 'prepend', 'before', 'after']) for (const order of [[1, 1], [1, 2, 1], [0, 1, 0, 1], [2, 1, 1, 2]]) {
      const $ = load('<main><p id="a"></p>gap<p id="b"></p><!--c--><p id="c"></p></main>', options);
      try {
        const main = $('main'), original = main.contents().get(), p = $('p').get();
        const target = method === 'append' || method === 'prepend' ? main : $(p[0]);
        const values = order.map(index => p[index]);
        const retained = $(values);
        target[method](retained);
        const children = main.contents().get();
        assert.equal(children.length, original.length);
        assert.equal(new Set(children).size, original.length);
        for (const node of original) assert(children.includes(node));
        sameNodes(retained.get(), values);
        checkLinks([main[0], ...original]);
        const elements = main.children().get();
        sameNodes($(elements[0]).nextAll().get(), elements.slice(1));
        sameNodes($(elements.at(-1)).prevAll().get(), elements.slice(0, -1).reverse());
        assert.throws(() => $(p[0]).after([p[1], main[0]]), { code: 'ERR_GROVEDOM_MUTATION' });
        checkLinks([main[0], ...original]);
      } finally { $.dispose(); }
    }
  });

  test(`traversal duplicates follow each axis and filter before deduplication (${execution}, xml=${xml})`, () => {
    const source = '<main><section id="s"><p id="a"><i>one</i>text</p>gap<p id="b">two</p><!--c--><p id="c">three</p></section></main>';
    const observe = $ => {
      const [a, b, c] = $('p').get(), records = [];
      for (const values of [[a, b, a], [b, c, b], [a, a], [c, a]]) {
        const selected = $(values);
        for (const axis of ['contents', 'children', 'parent', 'parents', 'next', 'prev', 'nextAll', 'prevAll', 'siblings']) {
          for (const filter of axis === 'contents' ? [undefined] : [undefined, '*', ':first', ':last', ':eq(1)', ':odd', function (i) { return i % 2 === 0; }]) {
            const result = selected[axis](filter), events = [];
            assert.equal(result.end(), selected);
            result.each(function (i, node) { events.push([i, node.type, node.attribs?.id, this === node]); });
            records.push(events);
          }
        }
      }
      return records;
    };
    const $ = load(source, options);
    try { assert.deepEqual(observe($), observe(cheerio(source, options))); }
    finally { $.dispose(); }
  });

  test(`form null setters keep distinct element and multiple-select semantics (${execution}, xml=${xml})`, () => {
    const source = '<main><input value="x"/><textarea>x</textarea><select id="one"><option value="x" selected="selected">x</option><option value="null">null</option></select><select id="many" multiple="multiple"><option value="x">x</option><option value="null">null</option></select></main>';
    const observe = $ => {
      $('input').val(null); $('textarea').val(null); $('#one').val(null);
      $('#many').val(['null']);
      const values = ['input', 'textarea', '#one', '#many'].map(selector => $(selector).val());
      return [values, $.html()];
    };
    const $ = load(source, options);
    try { assert.deepEqual(observe($), observe(cheerio(source, options))); }
    finally { $.dispose(); }
  });
}
