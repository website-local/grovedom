import test from 'node:test';
import assert from 'node:assert/strict';
import { load as cheerio } from 'cheerio';
import { load } from '../diagnostics/index.js';

for (const execution of ['buffered', 'direct']) for (const xml of [false, true]) {
  test(`${execution} ${xml ? 'XML' : 'HTML'}: text reads preserve mixed-node exclusions and retained snapshots`, () => {
    const source = '<main><p>\uFEFF雪🌿</p><p>A<b>B</b>C</p><script>script</script><style>style</style><i></i><section><!--comment--></section></main>';
    const $ = load(source, { execution, xml }), reference = cheerio(source, { xml });
    try {
      for (const selector of ['p', 'p:first-child', 'script', 'style', 'i', 'section', 'main']) {
        const node = $(selector), expected = reference(selector);
        assert.equal(node.text(), expected.text(), `${selector} text`);
        assert.equal(node.prop('innerText'), expected.prop('innerText'), `${selector} innerText`);
        assert.equal(node.contents().text(), expected.contents().text(), `${selector} contents`);
      }
      const leaf = $('p').first(), saved = leaf.text();
      const large = '\uFEFFé雪🌿\u0000'.repeat(10000);
      leaf.text(large);
      assert.equal(leaf.text(), large);
      assert.equal(saved, '\uFEFF雪🌿');
      const retained = leaf.contents(), snapshot = retained.text();
      leaf.text('replacement');
      assert.equal(retained.text(), snapshot);
      leaf.remove();
      assert.equal(leaf.text(), 'replacement');
      $.dispose();
      assert.equal(snapshot, large);
    } finally { $.dispose(); }
  });
}

test('XML CDATA and adjacent text concatenate without losing CDATA content', () => {
  const source = '<root><one><![CDATA[\uFEFF雪<&>]]></one><two>A<![CDATA[B]]>C</two></root>';
  const $ = load(source, { xml: true }), reference = cheerio(source, { xml: true });
  try {
    for (const selector of ['one', 'two', 'root']) {
      assert.equal($(selector).text(), reference(selector).text());
      assert.equal($(selector).contents().text(), reference(selector).contents().text());
    }
  } finally { $.dispose(); }
});
