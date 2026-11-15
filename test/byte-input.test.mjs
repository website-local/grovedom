import test from 'node:test';
import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { load, loadFast } from '../diagnostics/index.js';
import { kernel } from '../diagnostics/kernel.js';
import { decodeInput } from '../src/wasm/node.js';

const source = '<root><p title="é😀">' + 'a&lt;&amp;é😀\uFEFF'.repeat(900) + '</p></root>';
function snapshot(loader, input, options, document = true) {
  const $ = loader(input, options, document);
  try { return [$.html(), $('p').text(), $('p').attr('title')]; }
  finally { $.dispose(); }
}
const views = {
  Buffer(bytes) { return Buffer.concat([Buffer.from('prefix'), bytes, Buffer.from('suffix')]).subarray(6, 6 + bytes.length); },
  Uint8Array(bytes) {
    const backing = new Uint8Array(bytes.length + 12); backing.set(bytes, 6);
    return backing.subarray(6, 6 + bytes.length);
  },
};

for (const [mode, loader] of [['compatible', load], ['fast', loadFast]]) {
  for (const [kind, view] of Object.entries(views)) {
    test(`large ${kind} inputs preserve UTF-8, BOM and offsets (${mode})`, () => {
      const variants = [Buffer.from(source), Buffer.from('\uFEFF' + source),
        Buffer.concat([Buffer.from('<root><p>' + 'x'.repeat(9000)), Buffer.from([0, 0xc0, 0x80, 0xed, 0xa0, 0x80, 0xff]), Buffer.from('</p></root>')]),
        Buffer.concat([Buffer.from(source), Buffer.from([0xe2, 0x82])])];
      for (const bytes of variants) for (const xml of [false, true]) for (const document of [false, true]) {
        const options = { xml, scriptingEnabled: false };
        let expected;
        try { expected = snapshot(loader, bytes.toString('utf8'), options, document); }
        catch (error) {
          assert.equal(error.code, 'ERR_GROVEDOM_XML');
          const before = kernel.stats().liveDocuments;
          assert.throws(() => snapshot(loader, view(bytes), options, document), { code: error.code });
          assert.equal(kernel.stats().liveDocuments, before);
          continue;
        }
        assert.deepEqual(snapshot(loader, view(bytes), options, document), expected);
      }
    });

    test(`${kind} input is captured before option getters (${mode})`, () => {
      const bytes = view(Buffer.from(source)), expected = snapshot(loader, source);
      let calls = 0;
      assert.deepEqual(snapshot(loader, bytes, { get baseURI() {
        calls++; bytes.fill(120);
        const nested = loader('<p>nested</p>'); nested.dispose();
        return 'https://example.test/';
      } }), expected);
      assert.equal(calls, 1);
    });

    test(`throwing options for large ${kind} inputs leave no owner (${mode})`, () => {
      const before = kernel.stats().liveDocuments;
      assert.throws(() => loader(view(Buffer.from(source)), { get xml() { throw new Error('option failure'); } }), /option failure/);
      assert.equal(kernel.stats().liveDocuments, before);
      assert.deepEqual(snapshot(loader, view(Buffer.from(source))), snapshot(loader, source));
    });
  }

  test(`Buffer custom decoding is read once before load options (${mode})`, () => {
    const input = Buffer.from(source), events = [];
    Object.defineProperty(input, 'toString', { get() {
      events.push('decoder');
      return function (encoding) { assert.ok(this === input); events.push(encoding); return '<p>custom</p>'; };
    } });
    const $ = loader(input, { get baseURI() { events.push('options'); return undefined; } });
    try { assert.equal($('p').text(), 'custom'); assert.deepEqual(events, ['decoder', 'utf8', 'options']); }
    finally { $.dispose(); }
  });

  test(`Buffer conversion and view hooks do not affect ordinary decoding (${mode})`, () => {
    const input = Buffer.from(source);
    for (const name of ['buffer', 'byteOffset', 'byteLength', 'valueOf']) {
      Object.defineProperty(input, name, { get() { throw new Error('Unexpected ' + name); } });
    }
    assert.deepEqual(snapshot(loader, input), snapshot(loader, source));
  });

  test(`Uint8Array view getters keep their order and selected bytes (${mode})`, () => {
    const input = new Uint8Array(9000), bytes = Buffer.from(source), events = [];
    for (const [name, value] of [['buffer', bytes.buffer], ['byteOffset', bytes.byteOffset], ['byteLength', bytes.byteLength]]) {
      Object.defineProperty(input, name, { get() { events.push(name); return value; } });
    }
    assert.deepEqual(snapshot(loader, input), snapshot(loader, source));
    assert.deepEqual(events, ['buffer', 'byteOffset', 'byteLength']);
  });
}

test('unusual Buffer receivers retain the platform decoder behavior', () => {
  for (const property of ['length', 'utf8Slice']) {
    const input = Buffer.from(source), events = [];
    Object.defineProperty(input, property, { get() {
      events.push(property);
      return property === 'length' ? 5 : () => '<p>slice</p>';
    } });
    const expected = input.toString('utf8'), expectedEvents = events.splice(0);
    assert.equal(decodeInput(input, true), expected);
    assert.deepEqual(events, expectedEvents);
  }
  const input = Buffer.from(source);
  Object.setPrototypeOf(input, Object.create(Buffer.prototype, { toString: { value() { return 'subclass'; } } }));
  assert.equal(decodeInput(input, true), 'subclass');
});

test('small byte inputs and invalid input types preserve their load contracts', () => {
  for (const size of [0, 1, 8191, 8192, 8193]) {
    const input = Buffer.from('<p>' + 'x'.repeat(size) + '</p>');
    assert.deepEqual(snapshot(load, input), snapshot(load, input.toString('utf8')));
  }
  for (const input of [new Uint16Array(8), new DataView(new ArrayBuffer(8)), {}, 123]) {
    assert.throws(() => load(input), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
  }
});
