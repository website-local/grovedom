import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

test('XML serialization uses Cheerio entity spelling for text and attribute ASCII', () => {
  const value = Array.from({ length: 128 }, (_, i) => String.fromCharCode(i)).join('') + 'é😀';
  for (const xml of [false, true]) {
    const options = xml ? { xml: true } : {}, $ = load('<a></a>', options), c = cheerio('<a></a>', options);
    try {
      for (const open of [$, c]) open('a').attr('value', value).text(value);
      assert.equal($.xml(), c.xml());
      assert.equal($.html({ xmlMode: true }), c.html({ xmlMode: true }));
    } finally { $.dispose(); }
  }
});

for (const declaration of ['<!doctype html>', '<!doctype svg PUBLIC "public" "system">',
  '<!doctype html SYSTEM "system">', '<!doctype html PUBLIC "public">', '<!doctype html PUBLIC "" "system">',
  '<!doctype html PUBLIC "">', `<!doctype html PUBLIC 'a"b' 'c"d'>`]) {
  test(`HTML-to-XML serialization retains doctype identifiers: ${declaration}`, () => {
    const source = declaration + '<svg><image xlink:href="a"/></svg>', $ = load(source), c = cheerio(source);
    try { assert.equal($.xml(), c.xml()); assert.equal($.html({ xmlMode: true }), c.html({ xmlMode: true })); assert.equal($.html(), c.html()); }
    finally { $.dispose(); }
  });
}
