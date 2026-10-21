import test from 'node:test';
import assert from 'node:assert/strict';
import { createFacade } from '../src/facade/document.js';
import { kernel } from '../diagnostics/kernel.js';
import { decodeInput } from '../src/wasm/node.js';

function trackedFacade() {
  const owners = [], observed = Object.create(kernel);
  for (const method of ['create', 'createXML']) Object.defineProperty(observed, method, {
    value(...args) { const owner = kernel[method](...args); owners.push(owner); return owner; },
  });
  return { ...createFacade(observed, decodeInput), owners, close() { for (const owner of owners) kernel.dispose(owner); } };
}

for (const xml of [false, true]) {
  test(`throwing load options cannot leave an owner (${xml ? 'XML' : 'HTML'})`, () => {
    for (const options of [
      { xml, get baseURI() { throw new Error('base URI'); } },
      { xml, get execution() { throw new Error('execution'); } },
      { get xml() { throw new Error('XML option'); } },
      { xml: new Proxy({}, { ownKeys() { throw new Error('XML enumeration'); } }) },
      { xml: { get encodeEntities() { throw new Error('XML encoding'); } } },
    ]) {
      const api = trackedFacade(), before = kernel.stats().liveDocuments;
      try {
        assert.throws(() => api.load('<root><item/></root>', options));
        assert.equal(api.owners.length, 0, 'Construction failure must precede owner allocation');
        assert.equal(kernel.stats().liveDocuments, before);
      } finally { api.close(); }
    }
  });

  test(`load snapshots top-level getters once (${xml ? 'XML' : 'HTML'})`, () => {
    const calls = {}, options = {};
    for (const [name, value] of Object.entries({ scriptingEnabled: true, execution: 'buffered', xmlMode: false, xml, baseURI: 'https://example.test/' }))
      Object.defineProperty(options, name, { enumerable: true, get() {
        calls[name] = (calls[name] ?? 0) + 1;
        assert.equal(calls[name], 1, 'Repeated option getter: ' + name);
        return value;
      } });
    const api = trackedFacade();
    try {
      const $ = api.load('<root><a href="/path">text</a></root>', options);
      assert.equal($('a').prop('href'), 'https://example.test/path');
      assert.equal($('a').text(), 'text');
      assert.deepEqual(calls, { scriptingEnabled: 1, execution: 1, xmlMode: 1, xml: 1, baseURI: 1 });
      $.dispose();
    } finally { api.close(); }
  });
}

test('nested XML getters are captured once, including inherited and non-enumerable flags', () => {
  const calls = {};
  const getter = (name, value) => ({ configurable: true, get() {
    calls[name] = (calls[name] ?? 0) + 1;
    assert.equal(calls[name], 1, 'Repeated XML getter: ' + name);
    return value;
  } });
  const inherited = Object.defineProperty({}, 'lowerCaseTags', getter('lowerCaseTags', true));
  const xml = Object.create(inherited);
  Object.defineProperty(xml, 'decodeEntities', { ...getter('decodeEntities', true), enumerable: true });
  Object.defineProperty(xml, 'selfClosingTags', getter('selfClosingTags', false));
  const api = trackedFacade();
  try {
    const $ = api.load('<ROOT><ITEM a="&amp;"/></ROOT>', { xml });
    assert.equal($('item').attr('a'), '&');
    assert.equal($.xml(), '<root><item a="&amp;"></item></root>');
    assert.deepEqual(calls, { decodeEntities: 1, lowerCaseTags: 1, selfClosingTags: 1 });
    $.dispose();
  } finally { api.close(); }
});

test('load option callbacks can create and dispose another document before allocation', () => {
  const api = trackedFacade(), before = kernel.stats().liveDocuments;
  try {
    const $ = api.load('<p>outer</p>', { get baseURI() {
      assert.equal(api.owners.length, 0);
      const other = api.load('<p>inner</p>');
      assert.equal(other('p').text(), 'inner'); other.dispose();
      return 'https://example.test/';
    } });
    assert.equal($('p').text(), 'outer');
    assert.equal(kernel.stats().liveDocuments, before + 1);
    $.dispose();
  } finally { api.close(); }
  assert.equal(kernel.stats().liveDocuments, before);
});

test('exceptions during facade construction cannot orphan a parsed document', () => {
  const api = trackedFacade(), descriptor = Object.getOwnPropertyDescriptor(Function.prototype, 'root');
  try {
    Object.defineProperty(Function.prototype, 'root', { configurable: true, set() { throw new Error('construction'); } });
    assert.throws(() => api.load('<p>text</p>'), /construction/);
    assert.equal(api.owners.length, 0);
  } finally {
    if (descriptor) Object.defineProperty(Function.prototype, 'root', descriptor);
    else delete Function.prototype.root;
    api.close();
  }
});
