import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../src/index.js';
import { load as cheerio } from 'cheerio';

for (const xml of [false, true]) test(`per-call serializer options preserve owner defaults (xml=${xml})`, () => {
  const source = xml ? '<R empty=""><i>é &amp; text</i><b/></R>' : '<div empty=""><br>é &amp; text</div>';
  for (const parsing of [xml ? { xml: true } : {}, ...(xml ? [{ xml: { decodeEntities: false } }, { xml: { encodeEntities: false } }] : [])]) {
    const $ = load(source, parsing), c = cheerio(source, parsing);
    try {
      const initial = $.html();
      for (const options of [{}, { xmlMode: true }, { xmlMode: false }, { encodeEntities: false }, { decodeEntities: false }, { encodeEntities: 'utf8' }, { xml: { selfClosingTags: false, emptyAttrs: false } }, { xmlMode: true, encodeEntities: true }]) {
        assert.equal($.html(options), c.html(options), JSON.stringify(options));
        assert.equal($.html($('i,br').get(), options), c.html(c('i,br').get(), options));
        assert.equal($.html(), initial);
      }
      assert.throws(() => $.html({ arbitrary: true }), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
    } finally { $.dispose(); }
  }
});
