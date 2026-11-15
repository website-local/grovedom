import test from 'node:test';
import assert from 'node:assert/strict';
import { load, loadFast } from '../diagnostics/index.js';
import { kernel } from '../diagnostics/kernel.js';
import { load as cheerio } from 'cheerio';

for (const [mode, loader] of [['compatible', load], ['fast', loadFast]]) {
  for (const execution of ['buffered', 'direct']) {
    const label = `${mode}, ${execution}`;

    test(`namespace history does not retain unobserved replacement clones (${label})`, () => {
      const $ = loader('<main><section></section><section></section><svg><image xlink:href="old" data-payload="' +
        'x'.repeat(4096) + '"></image></svg></main>', { execution });
      try {
        const source = $('svg'), targets = $('section');
        source.find('image').removeAttr('href');
        for (let i = 0; i < 16; i++) targets.empty().append(source);
        const before = kernel.stats().liveBytes;
        for (let i = 16; i < 128; i++) targets.empty().append(source);
        const after = kernel.stats().liveBytes;
        assert.ok(after <= before + 32768, `unobserved clones grew backing from ${before} to ${after}`);
        const images = targets.find('image');
        images.attr('href', 'restored');
        assert.equal(images.length, 2);
        assert.equal((targets.toString().match(/xlink:href="restored"/g) ?? []).length, 2);
      } finally { $.dispose(); }
      assert.equal(kernel.stats().liveBytes, 0);
    });

    test(`clone histories survive unobserved descendants, nested templates and renames (${label})`, () => {
      const source = '<main><section></section><section></section><template id="source"><svg>' +
        '<g><image xlink:href="old" xml:lang="en" xmlns:xlink="urn:x"/></g>' +
        '</svg><template><svg><image xlink:href="inner"/></svg></template></template></main>';
      const run = $ => {
        const original = $('#source'), contents = original.contents();
        contents.find('image').removeAttr('href lang xlink');
        contents.filter('template').contents().find('image').removeAttr('href');
        $('section').append(original);
        // Clone a branch whose descendant history was copied without exposing it.
        const copy = $('section').first().children().clone();
        $('main').append(copy);
        const result = [];
        for (const template of $('main > template, section > template').get()) {
          const outer = $(template).contents();
          const image = outer.find('image'), retained = image.get(0);
          retained.name = 'customImage';
          image.attr('href', 'restored').attr('lang', 'fr').attr('xlink', 'urn:restored');
          assert.ok(image.get(0) === retained);
          result.push(image.toString());
          const inner = outer.filter('template').contents().find('image');
          inner.attr('href', 'nested');
          result.push(inner.toString());
        }
        return result;
      };
      const $ = loader(source, { execution });
      try { assert.deepEqual(run($), run(cheerio(source))); }
      finally { $.dispose(); }
    });

    test(`retained descendant histories outlive replacement and later clones (${label})`, () => {
      const $ = loader('<main><section></section><section></section><svg><image xlink:href="old"/></svg></main>', { execution });
      try {
        const source = $('svg'), targets = $('section');
        source.find('image').removeAttr('href');
        targets.append(source);
        const retained = targets.first().find('image'), node = retained.get(0);
        targets.empty().append(source);
        retained.attr('href', 'retained');
        assert.ok(retained.get(0) === node);
        assert.equal(retained.toString(), '<image xlink:href="retained"></image>');
        assert.equal(retained.parent().get(0).parent, null);
        retained.removeAttr('href');
        const copy = retained.clone().attr('href', 'copy');
        assert.equal(copy.toString(), '<image xlink:href="copy"></image>');
        assert.equal(retained.attr('href'), undefined);
        assert.ok(copy.get(0) !== node);
      } finally { $.dispose(); }
    });

    test(`reused node storage cannot inherit destroyed namespace histories (${label})`, () => {
      const $ = loader('<main><section></section><section></section><svg><image xlink:href="old"/></svg></main>', { execution });
      try {
        const source = $('svg'), targets = $('section');
        source.find('image').removeAttr('href');
        for (let i = 0; i < 32; i++) {
          targets.empty().append(source);
          targets.first().empty().append('<svg><image href="plain"/></svg>');
        }
        assert.equal(targets.first().html(), '<svg><image href="plain"></image></svg>');
        const plain = targets.first().find('image');
        plain.removeAttr('href').attr('href', 'new');
        assert.equal(plain.toString(), '<image href="new"></image>');
      } finally { $.dispose(); }
    });
  }
}
