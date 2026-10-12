import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

for (const xml of [false, true]) for (const execution of ['buffered', 'direct']) {
  test(`XML output keeps long names, escape boundaries and per-call options, xml=${xml}, ${execution}`, () => {
    const options = xml ? { xml: true } : {};
    const serializers = [{ xmlMode: true }, { xmlMode: true, encodeEntities: false },
      { xml: { selfClosingTags: false } }, { xmlMode: true, encodeEntities: 'utf8' }];
    for (const length of [1, 127, 1024]) {
      const name = 'n'.repeat(length), attribute = 'data-' + 'a'.repeat(length);
      const source = `<main><${name} ${attribute}=""><empty></empty></${name}></main>`;
      const $ = load(source, { ...options, execution }), c = cheerio(source, options);
      try {
        const target = $('main').children().first(), reference = c('main').children().first();
        const initial = $.xml();
        assert.equal(initial, c.xml());
        for (const size of [0, 1, 124, 128, 252, 256, 4092, 4096, 16384]) {
          const plain = 'v'.repeat(size), escaped = '&<>"\'$é😀';
          for (const value of [plain, escaped + plain, plain + escaped, plain + escaped + plain]) {
            target.attr(attribute, value);
            reference.attr(attribute, value);
            assert.equal($.xml(), c.xml());
            for (const serializer of serializers) {
              assert.equal($.html(serializer), c.html(serializer));
              assert.equal($.html(target.get(), serializer), c.html(reference.get(), serializer));
            }
          }
        }
        target.attr(attribute, 'last');
        reference.attr(attribute, 'last');
        assert.equal($.xml(), c.xml());
        assert.equal(initial, xml ? source.replace('<empty></empty>', '<empty/>') :
          '<html><head/><body>' + source.replace('<empty></empty>', '<empty/>') + '</body></html>');
      } finally { $.dispose(); }
    }
  });
}
