import test from 'node:test';
import assert from 'node:assert/strict';
import { kernel } from '../diagnostics/kernel.js';
import { createFacade } from '../src/facade/document.js';
import { decodeInput } from '../src/wasm/node.js';

function sameNodes(actual, expected) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) assert.equal(actual[i], expected[i]);
}

function tracedFacade() {
  let capture = false;
  const counts = { kindReads: 0, returnedIds: 0, calls: 0 };
  const traced = Object.fromEntries(Object.getOwnPropertyNames(kernel).map(key => {
    const value = kernel[key];
    return [key, typeof value !== 'function' ? value : (...args) => {
      const result = value.apply(kernel, args);
      if (capture) {
        counts.calls++;
        if ((key === 'read' || key === 'observe') && args[1] === 6) counts.kindReads++;
        if (result instanceof Uint32Array) counts.returnedIds += result.length;
      }
      return result;
    }];
  }));
  return { ...createFacade(traced, decodeInput), counts, measure(run) {
    Object.assign(counts, { kindReads: 0, returnedIds: 0, calls: 0 });
    capture = true;
    try { return run(); } finally { capture = false; }
  } };
}

for (const xml of [false, true]) for (const execution of ['buffered', 'direct']) {
  const options = { xml, execution }, label = `xml=${xml}, ${execution}`;
  for (const matches of [2, 80]) test(`relative list ordering does not expose unrelated descendants, ${matches} matches (${label})`, () => {
    const api = tracedFacade(), payload = '<div><b>unused</b></div>'.repeat(600);
    const tags = Array.from({ length: matches }, (_, i) => `<${i % 2 ? 'a' : 'p'} id="m${i}"></${i % 2 ? 'a' : 'p'}>`);
    const $ = api.load('<main>' + tags.slice(0, matches / 2).join('') + '<section>' + payload +
      '</section>' + tags.slice(matches / 2).join('') + '</main>', options);
    try {
      const main = $('main'), section = $('section');
      const retained = api.measure(() => main.find('> a, > p'));
      assert.deepEqual(retained.get().map(node => node.attribs.id), tags.map((_, i) => `m${i}`));
      assert.ok(api.counts.returnedIds < matches * 5 + 10, 'ordering must transfer matches, not the unrelated subtree');
      const snapshot = retained.get(), capacities = [];
      for (let cycle = 0; cycle < 8; cycle++) {
        sameNodes(main.find('> p, > a').get(), snapshot);
        section.empty();
        assert.equal(section.html(), '');
        section.append(payload);
        $.html();
        capacities.push(kernel.stats().liveBytes);
      }
      assert.equal(Math.max(...capacities.slice(2)), capacities[2], 'replaced, unexposed subtrees must reuse capacity');
      // Actual selections still preserve detached handles and their contents.
      const selected = section.find('b').first(), node = selected[0];
      section.empty();
      assert.equal(selected.text(), 'unused');
      assert.equal(selected[0], node);
      sameNodes(retained.get(), snapshot);
    } finally { $.dispose(); }
    assert.equal(kernel.stats().liveBytes, 0);
  });

  test(`raw data assignment learns kind once per written handle (${label})`, () => {
    const api = tracedFacade(), $ = api.load('<main>text<!--comment--><p>child</p></main>', options);
    try {
      const handles = api.measure(() => $('main').contents().get());
      assert.equal(api.counts.kindReads, 0, 'ordinary wrappers must not eagerly read node kind');
      for (const node of handles) {
        api.measure(() => { for (let i = 0; i < 120; i++) node.data = String(i); });
        assert.equal(api.counts.kindReads, 1);
        assert.equal(node.data, '119');
      }
      const element = handles[2];
      element.name = 'article';
      $(element).remove();
      const store = { retained: true };
      api.measure(() => { element.data = store; });
      assert.equal(api.counts.kindReads, 0);
      assert.equal(element.data, store);
      for (const value of [undefined, null, 0, false, 'reset', store]) {
        element.data = value;
        assert.equal(element.data, value);
      }
    } finally { $.dispose(); }
    assert.equal(kernel.stats().liveBytes, 0);
  });

  test(`cached raw data writes flush before throwing or reentering coercion (${label})`, () => {
    const api = tracedFacade(), $ = api.load('<main>text<p>before</p></main>', options);
    try {
      const text = $('main').contents()[0], p = $('p');
      text.data = 'cached';
      const sentinel = new Error('coercion stopped'), calls = [];
      p.text('queued');
      const result = api.measure(() => {
        assert.throws(() => { text.data = { toString() {
          calls.push(api.counts.calls);
          throw sentinel;
        } }; }, error => error === sentinel);
      });
      assert.equal(result, undefined);
      assert.deepEqual(calls, [execution === 'buffered' ? 1 : 0], 'flush must precede user coercion even if it throws');
      assert.equal(text.data, 'cached');
      assert.equal(p.text(), 'queued');
      text.data = { toString() {
        text.data = 'inner';
        p.text('reentered');
        return 'outer';
      } };
      assert.equal(text.data, 'outer');
      assert.equal(p.text(), 'reentered');
      $(text).remove();
      text.data = 'detached';
      assert.equal(text.data, 'detached');
      assert.throws(() => { text.data = { toString() { $.dispose(); return 'late'; } }; }, { code: 'ERR_GROVEDOM_DISPOSED' });
      let coerced = false;
      assert.throws(() => { text.data = { toString() { coerced = true; return 'late'; } }; }, { code: 'ERR_GROVEDOM_DISPOSED' });
      assert.equal(coerced, false);
    } finally { $.dispose(); }
    assert.equal(kernel.stats().liveBytes, 0);
  });
}
