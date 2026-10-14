import test from 'node:test';
import assert from 'node:assert/strict';
import { load as cheerio } from 'cheerio';
import { load } from '../diagnostics/index.js';

for (const execution of ['buffered', 'direct']) for (const xml of [false, true]) {
  test(`${execution} ${xml ? 'XML' : 'HTML'}: large attribute snapshots survive interleaved owners and buffer growth`, () => {
    const source = '<i ' + Array.from({ length: 1025 }, (_, i) => `data-${i}="v${i}"`).join(' ') + '></i>';
    const $ = load(source, { execution, xml }), reference = cheerio(source, { xml });
    const other = load('<b title="other"></b>', { execution, xml });
    try {
      const node = $('i'), expected = reference('i');
      node.removeAttr('data-1024'); expected.removeAttr('data-1024');
      const beforeWrite = node.attr();
      assert.deepEqual(beforeWrite, { ...expected.attr() });
      // The pending write must finish before its transfer space is reused.
      node.attr('data-1024', '雪🌿'); expected.attr('data-1024', '雪🌿');
      const afterWrite = node.attr();
      assert.deepEqual(afterWrite, { ...expected.attr() });
      assert.equal(Object.keys(beforeWrite).length, 1024);
      assert.equal(other('b').attr().title, 'other');
      // A larger mutation must leave previously returned strings unchanged.
      const large = '\uFEFF雪'.repeat(400000);
      node.attr('data-0', large);
      const grown = node.attr();
      assert.equal(grown['data-0'], large);
      assert.equal(afterWrite['data-0'], 'v0');
      node.removeAttr(Object.keys(grown).join(' '));
      assert.deepEqual(node.attr(), {});
      $.dispose();
      assert.equal(grown['data-0'], large);
    } finally { $.dispose(); other.dispose(); }
  });

  test(`${execution} ${xml ? 'XML' : 'HTML'}: attribute snapshot keys are own data properties`, () => {
    const $ = load('<i></i>', { execution, xml });
    const name = 'grovedom-inherited-setter';
    const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, name);
    try {
      const node = $('i');
      for (const key of ['__proto__', 'constructor', 'toString', name]) node.attr(key, 'value');
      Object.defineProperty(Object.prototype, name, { configurable: true, set() { throw new Error('Inherited setter called'); } });
      const snapshot = node.attr();
      assert.equal(Object.getPrototypeOf(snapshot), Object.prototype);
      for (const key of ['__proto__', 'constructor', 'toString', name]) {
        assert.deepEqual(Object.getOwnPropertyDescriptor(snapshot, key), {
          value: 'value', writable: true, enumerable: true, configurable: true,
        });
      }
    } finally {
      if (descriptor) Object.defineProperty(Object.prototype, name, descriptor);
      else delete Object.prototype[name];
      $.dispose();
    }
  });
}

test('attribute snapshots flush a large selection before reading its first node', () => {
  const $ = load('<i title="first"></i>' + '<i></i>'.repeat(5000));
  try {
    const all = $('i');
    all.attr('data-pending', 'done');
    assert.deepEqual(all.attr(), { title: 'first', 'data-pending': 'done' });
    assert.equal(all.last().attr('data-pending'), 'done');
  } finally { $.dispose(); }
});
