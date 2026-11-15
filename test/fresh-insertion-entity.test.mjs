import test from 'node:test';
import assert from 'node:assert/strict';
import { load, loadFast } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const loaders = [['compatible', load], ['fast', loadFast]];

for (const [mode, loader] of loaders) for (const execution of ['buffered', 'direct']) for (const xml of [false, true]) {
  const options = { execution, xml }, label = `${mode}, ${execution}, xml=${xml}`;

  test(`multi-target insertion preserves the earlier clone when the final move would cycle (${label})`, () => {
    const $ = loader('<main id="source"><section id="inside"></section></main><aside id="outside"></aside>', options, false);
    try {
      const source = $('#source'), inside = $('#inside'), outside = $('#outside');
      const original = source.get(0), destination = inside.get(0);
      source.attr('data-before', 'kept');
      assert.throws(() => $([outside.get(0), destination]).append(source), { code: 'ERR_GROVEDOM_MUTATION' });
      assert.equal(source.attr('data-before'), 'kept');
      assert.equal(original.parent, $.root().get(0));
      assert.equal(inside.parent().get(0), original);
      const copy = outside.children();
      assert.equal(copy.length, 1);
      assert.notEqual(copy.get(0), original);
      assert.notEqual(copy.children().get(0), destination);
      assert.equal(copy.toString(), source.toString());
      assert.equal(copy.parent().get(0), outside.get(0));
    } finally { $.dispose(); }
  });

  test(`a rejected ancestor move preserves preceding sibling effects (${label})`, () => {
    const $ = loader('<main><section><p id="a"></p></section><b id="b"></b></main>', options, false);
    try {
      const main = $('main'), section = $('section'), a = $('#a').get(0), b = $('#b').get(0);
      assert.throws(() => $(a).after([b, main.get(0)]), { code: 'ERR_GROVEDOM_MUTATION' });
      assert.deepEqual(section.children().get(), [a, b]);
      assert.equal(a.next, b);
      assert.equal(b.prev, a);
      assert.equal(b.parent, section.get(0));
      assert.equal(section.parent().get(0), main.get(0));
      assert.equal(main.get(0).parent, $.root().get(0));
    } finally { $.dispose(); }
  });

  test(`cloned insertion results preserve source identity and independent children (${label})`, () => {
    const source = '<main><section id="one"></section><section id="two"></section><article><i>retained</i></article></main>';
    for (const method of ['appendTo', 'prependTo', 'insertBefore', 'insertAfter']) {
      const run = ($, checkResult = false) => {
        const original = $('article'), node = original.get(0), child = original.children().get(0);
        const resultSelection = original[method]('section');
        // Cheerio appendTo/prependTo return the original selection. Compare the
        // inserted DOM while checking GroveDOM's collected result separately.
        const inserted = $('article');
        assert.equal(inserted.length, 2);
        if (checkResult) {
          assert.equal(resultSelection.length, 2, method);
          assert.equal(resultSelection.end(), original, method);
          assert.deepEqual(resultSelection.get(), inserted.get(), method);
        }
        inserted.first().find('i').text('copy');
        const result = [$.html(), inserted.get().map(value => value === node),
          inserted.children().get().map(value => value === child), original.text(), original.parent().length];
        const detached = inserted.first().clone();
        detached.find('i').text('detached');
        result.push(inserted.first().text(), detached.text());
        return result;
      };
      const $ = loader(source, options, false);
      try { assert.deepEqual(run($, true), run(cheerio(source, { xml }, false)), method); }
      finally { $.dispose(); }
    }
  });

  test(`parsed fragments preserve insertion order at shallow and deep destinations (${label})`, () => {
    for (const depth of [0, 128]) for (const method of ['prepend', 'before', 'after']) {
      const source = '<main>' + '<section>'.repeat(depth) + '<target><old>old</old></target>' + '</section>'.repeat(depth) + '</main>';
      const $ = loader(source, options, false), expected = cheerio(source, { xml }, false);
      try {
        const retained = $('target').get(0);
        const fragment = '<i>first</i>text<!--note--><b>last</b>';
        $('target')[method](fragment); expected('target')[method](fragment);
        $.root().prepend('<header>root</header>'); expected.root().prepend('<header>root</header>');
        assert.equal($.html(), expected.html(), `${method}, depth=${depth}`);
        assert.equal($('target').get(0), retained);
        assert.equal($('target').text(), expected('target').text());
      } finally { $.dispose(); }
    }
  });

  test(`fresh insertion retains invalid-target checks, self no-ops and repeated after anchors (${label})`, () => {
    const $ = loader('<main>text<p id="a"></p><p id="b"></p><p id="c"></p></main>', options, false);
    try {
      const main = $('main'), [a, b, c] = $('p').get(), text = main.contents().get(0);
      assert.throws(() => $(text).prepend('<b>invalid</b>'), { code: 'ERR_GROVEDOM_MUTATION' });
      assert.equal(text.data, 'text');
      assert.deepEqual(main.children().get(), [a, b, c]);
      for (const method of ['append', 'prepend', 'before', 'after']) $(a)[method](a);
      $(a).after([a, b, b, c, c]);
      assert.deepEqual(main.children().get(), [a, b, c]);
      assert.equal(a.next, b);
      assert.equal(b.next, c);
      assert.equal(c.next, null);
      const detached = $('<detached>kept</detached>').remove();
      detached.before('<b>ignored</b>').after('<i>ignored</i>');
      assert.equal(detached.parent().length, 0);
      assert.equal(detached.text(), 'kept');
      assert.equal($('b, i').length, 0);
    } finally { $.dispose(); }
  });
}

const entityCases = [
  ['plain Unicode', 'plain é😀 words', 'plain é😀 words'],
  ['literal ampersands', 'a&b && tail&', 'a&b && tail&'],
  ['unknown names', '&unknown;&AMP;&xA;', '&unknown;&AMP;&xA;'],
  ['malformed references', '&#; &#x; &#xZZ; &#12x; &amp', '&#; &#x; &#xZZ; &#12x; &amp'],
  ['named references', '&lt;&gt;&amp;&quot;&apos; &amp;lt;', '<>&"\' &lt;'],
  ['numeric replacements', '&#65; &#x41; &#X1F600; &#128; &#0; &#55296; &#1114112; &#999999999999999999999;', 'A A 😀 € � � � �'],
  ['mixed references', 'before &unknown; &amp; after &#x1F600; &broken &lt; end&', 'before &unknown; & after 😀 &broken < end&'],
];

for (const [mode, loader] of loaders) for (const execution of ['buffered', 'direct']) {
  for (const [name, raw, decoded] of entityCases) test(`XML ${name} survive input and output reuse (${mode}, ${execution})`, () => {
    for (const padding of [0, 4096]) for (const seeded of [false, true]) {
      const prefix = 'p'.repeat(padding), suffix = 's'.repeat(padding);
      const encoded = prefix + raw + suffix, expected = prefix + decoded + suffix;
      const seed = seeded ? '<seed a="&amp;">&amp;</seed>' : '';
      const input = Buffer.from(`<Root>${seed}<value a="${encoded}">${encoded}</value><scratch></scratch></Root>`);
      const $ = loader(input, { xml: true, execution });
      try {
        input.fill(0x78);
        const value = $('value'), clone = value.clone(), original = value.get(0);
        const check = selected => {
          assert.equal(selected.attr('a'), expected);
          assert.equal(selected.text(), expected);
        };
        check(value); check(clone);
        $('scratch').attr('overwrite', 'x'.repeat(16384)).text('y'.repeat(16384));
        $.xml();
        $('scratch').html('<later a="&amp;">&#65;</later><plain a="&unknown;">&unknown;</plain>');
        assert.equal($('later').attr('a'), '&');
        assert.equal($('plain').text(), '&unknown;');
        value.before(`<inserted a="${encoded}">${encoded}</inserted>`);
        const inserted = $('inserted');
        $('scratch').html('<replacement>reused</replacement>');
        $.xml();
        check(value); check(clone); check(inserted);
        value.remove(); $('Root').prepend(value);
        assert.equal($('value').get(0), original);
        check(value);
      } finally { $.dispose(); }
    }
  });

  test(`XML disabled decoding keeps named, numeric and malformed references literal (${mode}, ${execution})`, () => {
    for (const [, raw] of entityCases) {
      const $ = loader(`<Root><value a="${raw}">${raw}</value><scratch></scratch></Root>`, {
        xml: { decodeEntities: false }, execution,
      });
      try {
        const value = $('value');
        $('scratch').html('<later a="&amp;">&#65;</later>');
        $.xml();
        assert.equal(value.attr('a'), raw);
        assert.equal(value.text(), raw);
        assert.equal($('later').attr('a'), '&amp;');
        assert.equal($('later').text(), '&#65;');
      } finally { $.dispose(); }
    }
  });
}
