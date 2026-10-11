import test from 'node:test';
import assert from 'node:assert/strict';
import { load as cheerio } from 'cheerio';
import { load } from '../diagnostics/index.js';

for (const execution of ['buffered', 'direct']) for (const xml of [false, true]) {
  test(`${execution} ${xml ? 'XML' : 'HTML'}: attribute snapshots preserve JSON escape boundaries and long UTF-8 spans`, () => {
    const $ = load('<main><i></i></main>', { execution, xml });
    const reference = cheerio('<main><i></i></main>', { xml });
    const node = $('i'), expected = reference('i');
    const controls = Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)).join('');
    const values = [
      '', 'plain', '"\\', controls,
      `"${'x'.repeat(4096)}\\`,
      `雪🌿${'é'.repeat(2048)}\n${'y'.repeat(4096)}\tend`,
      `before${controls}after`, '\uFEFF\u2028\u2029',
    ];
    try {
      for (const value of values) {
        node.attr({ 'data-value': value, title: 'unchanged', 'data-empty': '' });
        expected.attr({ 'data-value': value, title: 'unchanged', 'data-empty': '' });
        const snapshot = node.attr();
        assert.deepEqual(snapshot, { ...expected.attr() });
        assert.equal(snapshot['data-value'], value);
        node.attr('data-value', 'next');
        assert.equal(node.attr()['data-value'], 'next');
        assert.equal(snapshot['data-value'], value, 'A later read must not overwrite an earlier snapshot');
      }
      node.removeAttr('data-value title data-empty');
      assert.deepEqual(node.attr(), {});
    } finally {
      $.dispose();
    }
  });
}
