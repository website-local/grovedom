import test from 'node:test';
import assert from 'node:assert/strict';
import { load, contains } from '../diagnostics/index.js';
import { kernel } from '../diagnostics/kernel.js';
import { createFacade } from '../src/facade/document.js';
import { decodeInput } from '../src/wasm/node.js';

const markup = '<main><p id="a">one</p><p id="b">two</p></main>';
const disposed = { code: 'ERR_GROVEDOM_DISPOSED' };

for (const xml of [false, true]) for (const execution of ['buffered', 'direct']) {
  const options = { xml, execution }, label = `xml=${xml}, ${execution}`;

  test(`retained internal records preserve snapshots, identity and disposal (${label})`, () => {
    const $ = load(markup, options), selected = $('p'), [a, b] = selected.get();
    // Internals are inspected for this implementation's lifetime regression;
    // their names and shape are not part of the supported application API.
    const record = selected._state, nodeRecord = a._state, document = record.state;
    const first = selected.first(), sliced = selected.slice(0, 1), owner = document.owner;
    try {
      assert.equal(nodeRecord.state, document);
      selected[0] = b;
      assert.equal(selected._state, record);
      assert.equal(selected[0], b);
      assert.equal(first[0], a);
      assert.equal(sliced[0], a);
      assert.deepEqual(selected.splice(0, 1, a), [b]);
      $.merge(selected, [b]);
      assert.deepEqual(selected.get(), [a, b, b]);
      assert.equal(selected.eq(2).end(), selected);
      $(a).remove();
      assert.equal($(a)[0], a);
      assert.equal($(a).text(), 'one');
    } finally { $.dispose(); }
    assert.equal(document.owner, null);
    assert.equal(document.words, null);
    assert.equal(document.payload, null);
    assert.equal(document.wrappers.size, 0);
    if (owner._state) {
      assert.equal(owner._state.runtime, null);
      assert.equal(owner._state.pointer, 0);
    }
    assert.throws(() => selected.text(), disposed);
    assert.throws(() => a.name, disposed);
  });

  test(`read, mutation and cached-property paths reject disposal (${label})`, () => {
    const $ = load(markup, options), selected = $('p'), empty = $('missing');
    const main = $('main')[0], node = selected[0], attrs = node.attribs;
    const iterator = selected[Symbol.iterator]();
    assert.equal(iterator.next().value, node);
    selected.data('cached', { retained: true });
    assert.deepEqual(Object.keys(attrs), ['id']);
    $.dispose();
    let coercions = 0, callbacks = 0;
    const value = { toString() { coercions++; return 'value'; } };
    const actions = [
      () => selected[0], () => selected.get(), () => selected.get(-1),
      () => selected.get('0'), () => selected.length, () => Reflect.ownKeys(selected),
      () => iterator.next(), () => selected.toString(), () => selected.children(),
      () => selected.clone(), () => selected.empty(), () => selected.remove(),
      () => selected.attr(), () => selected.attr('id'), () => selected.attr('id', 'new'),
      () => selected.attr('id', undefined), () => selected.attr({ id: value }),
      () => selected.text(), () => selected.text(value), () => selected.html(),
      () => selected.html('<b>new</b>'), () => selected.html({}),
      () => selected.addClass('new'), () => selected.wrap('<div></div>'),
      () => selected.removeData(), () => selected.data('cached'),
      () => selected.index(), () => selected.css(), () => selected.val(),
      () => node.name, () => node.data, () => node.children, () => node.firstChild,
      () => node.parent, () => attrs.id, () => 'id' in attrs, () => Object.keys(attrs),
      () => contains(main, node), () => $.contains(main, node), () => $.text(selected),
      () => selected.each(() => { callbacks++; }),
      () => empty.get(), () => empty.clone(), () => empty.text(),
      () => empty.attr('id', undefined), () => empty.val(), () => empty.removeData(),
    ];
    for (const action of actions) assert.throws(action, disposed, String(action));
    assert.equal(coercions, 0);
    assert.equal(callbacks, 0);
    assert.equal(kernel.stats().liveDocuments, 0);
  });

  test(`coercion and callbacks cannot wrap or observe nodes after disposal (${label})`, () => {
    const actions = [
      ($, selected) => selected.text({ toString() { $.dispose(); return 'next'; } }),
      ($, selected) => selected.attr('id', { toString() { $.dispose(); return 'next'; } }),
      ($, selected) => selected.attr('id', () => { $.dispose(); return 'next'; }),
      ($, selected) => selected.text(() => { $.dispose(); return undefined; }),
      ($, selected) => selected.html(() => { $.dispose(); return '<b>next</b>'; }),
      ($, selected) => selected.splice({ valueOf() { $.dispose(); return 0; } }, 1),
      ($, selected) => selected.each(() => { $.dispose(); }),
      ($, selected) => selected.nextUntil(() => { $.dispose(); return true; }),
    ];
    for (const action of actions) {
      const $ = load(markup, options), selected = $('p'), state = selected._state.state;
      try {
        assert.throws(() => action($, selected), disposed, String(action));
        assert.equal(state.wrappers.size, 0);
        assert.equal(state.owner, null);
      } finally { $.dispose(); }
    }
  });

  test(`an explicitly stopped callback can still dispose its document (${label})`, () => {
    const $ = load(markup, options), selected = $('p');
    let calls = 0;
    assert.equal(selected.each(() => { calls++; $.dispose(); return false; }), selected);
    assert.equal(calls, 1);
    assert.throws(() => selected.length, disposed);
  });

  test(`disposing another document preserves callbacks and drops its pending queue (${label})`, () => {
    const $ = load(markup, options), other = load('<p>discarded document</p>', options);
    const retained = other('p').text('pending replacement');
    let replacement;
    try {
      const visited = [];
      $('p').each(function (i) {
        if (i === 0) other.dispose();
        visited.push($(this).text());
        $(this).attr('visited', String(i));
      });
      assert.deepEqual(visited, ['one', 'two']);
      assert.equal($('p').eq(1).attr('visited'), '1');
      assert.throws(() => retained.text(), disposed);
      assert.throws(() => other.flush(), disposed);
      replacement = load('<p>new document</p>', options);
      assert.equal(replacement('p').text(), 'new document');
    } finally {
      replacement?.dispose();
      other.dispose();
      $.dispose();
    }
  });
}

test('direct records do not make copied objects or another facade valid inputs', () => {
  const first = createFacade(kernel, decodeInput), second = createFacade(kernel, decodeInput);
  const $ = first.load(markup), other = first.load('<p>other</p>'), foreign = second.load('<p>foreign</p>');
  try {
    const selected = $('p'), node = selected[0];
    for (const input of [{ ...selected }, { ...node }, foreign('p'), foreign('p')[0], other('p'), other('p')[0]]) {
      assert.throws(() => $(input), TypeError);
      assert.throws(() => selected.append(input), TypeError);
    }
    assert.equal($('p', other.root()).text(), 'other');
    assert.equal(first.contains(node, other('p')[0]), false);
    assert.equal($.html().includes('foreign'), false);
  } finally { $.dispose(); other.dispose(); foreign.dispose(); }
});
