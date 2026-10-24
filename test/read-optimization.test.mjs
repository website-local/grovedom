import test from 'node:test';
import assert from 'node:assert/strict';
import { load as cheerio } from 'cheerio';
import { load } from '../diagnostics/index.js';
import { kernel } from '../diagnostics/kernel.js';
import { createFacade } from '../src/facade/document.js';
import { decodeInput } from '../src/wasm/node.js';

for (const xml of [false, true]) for (const execution of ['buffered', 'direct']) {
  const options = { xml, execution }, label = `xml=${xml}, ${execution}`;
  test(`first-node getters preserve order, empty reads and aggregate observations (${label})`, () => {
    const run = factory => {
      const $ = factory('<main><p title="first">A<b>B</b></p><p title="last">C</p></main>', options);
      try {
        const nodes = $('p').get(), selected = $([nodes[1], nodes[0], nodes[1]]);
        selected.attr('data-pending', 'flushed');
        const first = [selected.attr('title'), Object.entries(selected.attr()), selected.html(),
          selected.prop('outerHTML'), selected.prop('tagName')];
        const aggregates = [selected.text(), $.text(selected), selected.toString(),
          $.html(selected.get()), $.xml(selected.get()), $.html(selected.get(), { xml: true })];
        const empty = $('missing');
        selected.attr('title', 'after');
        const emptyReads = [empty.attr('title'), empty.attr(), empty.html(), empty.prop('outerHTML'),
          empty.prop('textContent'), empty.prop('innerText'), empty.text(), $.xml(empty.get())];
        return [first, aggregates, emptyReads, selected.attr('title'),
          $.contains($('main')[0], nodes[0]), $.contains(nodes[0], nodes[1]), $.html()];
      } finally { $.dispose?.(); }
    };
    assert.deepEqual(run(load), run(cheerio));
  });

  test(`raw child arrays retain identity and independent snapshots across edits (${label})`, () => {
    const run = factory => {
      const $ = factory('<main>start<!--gap--><p>one</p><template><b>inside</b></template></main>', options);
      try {
        const main = $('main')[0], first = main.children, alias = main.childNodes;
        assert.deepEqual(first, alias);
        assert.equal(first[0], main.firstChild);
        const retained = first.slice(), paragraph = $('p')[0];
        $('main').append('<i>later</i>');
        const after = main.children;
        assert.equal(after.length, retained.length + 1);
        for (let i = 0; i < retained.length; i++) assert.equal(after[i], retained[i]);
        $('p').remove();
        assert(retained.includes(paragraph));
        assert(!main.childNodes.includes(paragraph));
        const describe = node => [node.type, node.name ?? null, node.data ?? null];
        const template = $('template')[0], contents = template.children;
        const templateShape = contents.map(node => [describe(node), (node.children ?? []).map(describe)]);
        return [retained.map(describe), main.children.map(describe), templateShape, $(paragraph).text(), $.html()];
      } finally { $.dispose?.(); }
    };
    assert.deepEqual(run(load), run(cheerio));
    const $ = load('<main><p>retained</p></main>', options), node = $('main')[0];
    // GroveDOM exposes array snapshots; Cheerio exposes its live children array.
    const first = node.children, second = node.childNodes, child = first[0];
    assert.notEqual(first, second);
    first.splice(0, first.length);
    assert.equal(node.children[0], child);
    assert.equal(second[0], child);
    $.dispose();
    assert.throws(() => node.children, { code: 'ERR_GROVEDOM_DISPOSED' });
    assert.throws(() => node.childNodes, { code: 'ERR_GROVEDOM_DISPOSED' });
  });

  test(`scalar text properties and option fallback observe only the first node (${label})`, () => {
    const run = factory => {
      const $ = factory('<main><p>A<b>B</b><script>C</script></p><p>D</p>' +
        '<select><option>first</option><option>second</option></select></main>', options);
      try {
        const paragraphs = $('p'), options = $('option');
        const initial = [paragraphs.prop('textContent'), paragraphs.prop('innerText'), options.attr('value')];
        paragraphs.text('changed');
        const changed = paragraphs.prop('textContent');
        options.text('new value');
        return [initial, changed, options.attr('value'), paragraphs.text(), options.text(), $.html()];
      } finally { $.dispose?.(); }
    };
    assert.deepEqual(run(load), run(cheerio));
  });

  test(`nested wrapping preserves callbacks, first-child descent and retained handles (${label})`, () => {
    const run = factory => {
      const $ = factory('<main><p id="a">A</p><p id="b">B</p></main>', options);
      try {
        const original = $('p').get(), events = [];
        $('p').wrap(function (i, node) {
          events.push(['wrap', i, this === original[i], node === this, $(this).text()]);
          if (!i) $('#b').attr('data-side', 'seen');
          return '<section><div>before<em><strong></strong><i></i></em><aside></aside></div></section>';
        });
        $('p').wrapInner(function (i) {
          events.push(['inner', i, this === original[i], $(this).attr('data-side') ?? null]);
          return '<span><b></b><i></i></span>';
        });
        assert.deepEqual($('p').get(), original);
        return [events, $.html()];
      } finally { $.dispose?.(); }
    };
    assert.deepEqual(run(load), run(cheerio));
  });
}

test('first-node getter operands stay bounded as selections grow', () => {
  const observed = Object.fromEntries(Object.getOwnPropertyNames(kernel).map(key => [key, kernel[key]]));
  const reads = [];
  for (const name of ['read', 'observe']) observed[name] = (...args) => {
    reads.push({ operation: args[1], count: typeof args[2] === 'number' ? 1 : args[2].length });
    return kernel[name](...args);
  };
  const { load: measured } = createFacade(observed, decodeInput);
  for (const size of [1, 128]) {
    const $ = measured('<main>' + '<p title="first">text</p>'.repeat(size) + '</main>');
    try {
      const selection = $('p');
      reads.length = 0;
      assert.equal(selection.attr('title'), 'first');
      assert.deepEqual(selection.attr(), { title: 'first' });
      assert.equal(selection.html(), 'text');
      assert.equal(selection.prop('outerHTML'), '<p title="first">text</p>');
      assert.equal(selection.prop('tagName'), 'P');
      selection.attr('data-pending', 'flushed');
      assert.equal(selection.attr('data-pending'), 'flushed');
      assert(reads.length > 0);
      assert(reads.every(row => row.count === 1));
      reads.length = 0;
      assert.equal(selection.text(), 'text'.repeat(size));
      assert.equal(reads.at(-1).count, size);
    } finally { $.dispose(); }
  }
});
