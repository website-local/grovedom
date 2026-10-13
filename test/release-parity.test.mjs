import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const markup = '<div><!--comment-->text<p id="a" title="A">one</p><p id="b" title="B">two</p></div>';
const attributes = ($, selector = 'p') => $(selector).get().map(node => ({ ...node.attribs }));

for (const xml of [false, true]) for (const execution of ['buffered', 'direct']) {
  const options = { xml, execution }, label = `xml=${xml}, ${execution}`;
  function parity(name, run, html = markup) {
    test(`${name} (${label})`, () => {
      const $ = load(html, options, false), c = cheerio(html, { xml }, false);
      try { assert.deepEqual(run($), run(c)); } finally { $.dispose(); }
    });
  }

  parity('node-based find retains the searching selection as its previous context', $ => {
    const roots = $('div'), requested = $('p'), found = roots.find(requested);
    assert.equal(found.end(), roots);
    return [found.get().map(node => node.attribs.id), found.addBack().get().map(node => node.name)];
  });

  parity('property relation aliases agree with the underlying node identities', $ => {
    const selected = $('p'), first = selected.first(), last = selected.last();
    return [first.prop('nextSibling') === last[0], last.prop('previousSibling') === first[0],
      first.prop('firstChild') === first[0].firstChild, first.prop('lastChild') === first[0].lastChild,
      first.prop('previousSibling') === first[0].previousSibling];
  });

  test(`read-only property writes fail explicitly without creating attributes (${label})`, () => {
    const $ = load(markup, options, false);
    try {
      const first = $('p').first(), original = $.html(), node = first[0];
      for (const key of ['type', 'nodeType', 'children', 'childNodes', 'parent', 'parentNode',
        'next', 'prev', 'nextSibling', 'previousSibling', 'firstChild', 'lastChild']) {
        assert.throws(() => first.prop(key, null), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
        assert.equal($.html(), original);
        assert.equal(first[0], node);
      }
      assert.throws(() => first.prop({ title: 'kept', parent: null }), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
      assert.equal(first.attr('title'), 'kept');
      assert.equal(first.attr('parent'), undefined);
      assert.equal(first[0].parent, $('div')[0]);
    } finally { $.dispose(); }
  });

  parity('array extraction flattens callback arrays once and preserves their empty entries', $ => $.extract({
    first: 'p',
    values: [{ selector: 'p', value: (node, key, previous) => [$(node).attr('id'), [key, previous.first], null, undefined] }],
    omitted: [{ selector: 'p', value: () => undefined }],
    single: { selector: 'p', value: node => [$(node).text(), null] },
  }));

  parity('extraction includes inherited enumerable descriptors', $ => $.extract(
    Object.assign(Object.create({ inherited: 'p' }), { own: 'div' }),
  ));

  parity('property callbacks visit elements with original selection indices', $ => {
    const seen = [], mixed = $('div').contents();
    assert.equal(mixed.prop('title', function (index, old) {
      seen.push([index, this.type, old]);
      return index ? null : undefined;
    }), mixed);
    return [seen, attributes($), $.html()];
  });

  parity('ordinary property callbacks stringify returned undefined and functions', $ => {
    const seen = [];
    function returned() { throw new Error('A returned function must not be called'); }
    returned.toString = () => { seen.push($('p').first().attr('title')); return 'function value'; };
    $('p').prop('title', index => index ? returned : undefined);
    return [seen, attributes($), $.html()];
  });

  parity('property callbacks read raw tag names and relative attribute values', $ => {
    const seen = [];
    $('p').prop('tagName', function (index, old) { seen.push([index, old]); return 'aside'; });
    $('a').prop('href', function (index, old) { seen.push([index, old]); return `${old}?next`; });
    return [seen, $.html()];
  }, markup + '<a href="/guide">link</a>');

  parity('property maps observe writes in element/key order and stringify null', $ => {
    const seen = [];
    const map = {
      get title() { seen.push(attributes($)); return null; },
      get lang() { seen.push(attributes($)); return 'en'; },
    };
    $('p').prop(map);
    return [seen, $.html()];
  });

  parity('property map getter errors preserve only earlier per-element effects', $ => {
    const error = new Error('stop map');
    assert.throws(() => $('p').prop({ title: 'changed', get lang() { throw error; } }), thrown => thrown === error);
    return attributes($);
  });

  parity('style maps observe writes in element/key order', $ => {
    const seen = [];
    $('p').css({
      get color() { seen.push(attributes($)); return 'red'; },
      get display() { seen.push(attributes($)); return 'block'; },
    });
    return [seen, $.html()];
  });

  parity('style map callbacks receive key indices for each element', $ => {
    const seen = [];
    $('p').css({
      color(index, old) { seen.push([this.attribs.id, index, old]); return 'red'; },
      display(index, old) { seen.push([this.attribs.id, index, old]); return 'block'; },
    });
    return [seen, $.html()];
  });

  parity('style map getter errors preserve earlier effects and empty setters chain', $ => {
    const missing = $('missing');
    assert.equal(missing.css({ color: 'red' }), missing);
    const error = new Error('stop map');
    assert.throws(() => $('p').css({ color: 'red', get display() { throw error; } }), thrown => thrown === error);
    return attributes($);
  });

  parity('replacement moves existing nodes across targets without implicit clones', $ => {
    const replacement = $('<i>new</i>'), targets = $('p');
    targets.replaceWith(replacement);
    assert.equal($('i').length, 1);
    assert.equal($('i')[0], replacement[0]);
    assert.equal(targets[0].parent, null);
    assert.equal(targets[1].parent, null);
    return $.html();
  });

  test(`self replacement preserves neighboring nodes and retained identity (${label})`, () => {
    const $ = load(markup, options, false);
    try {
      const targets = $('p'), retained = targets.first(), neighbors = $('div').contents().slice(0, 2).get();
      targets.replaceWith(retained);
      assert.equal($('p').length, 1);
      assert.equal($('p')[0], retained[0]);
      assert.deepEqual($('div').contents().get(), [...neighbors, retained[0]]);
      // Cheerio's self-replacement can remove the preceding text node. Keep
      // unaffected siblings and reciprocal native links in this supported guard.
      assert.equal(retained[0].prev, neighbors[1]);
      assert.equal(neighbors[1].next, retained[0]);
    } finally { $.dispose(); }
  });

  parity('escaped identifier suffixes do not become positional filters', $ => {
    $('p').first().attr('id', 'item:first');
    $('p').last().attr('id', 'item:last');
    return ['#item\\:first', '#item\\:last', '#item\\:first:first', '#item\\:last:last'].map(selector =>
      $(selector).get().map(node => node.attribs.id));
  });

  parity('ordinary value setters dispatch from the first selected node', $ => {
    const mixed = $('div').contents();
    assert.equal(mixed.val('ignored'), mixed);
    assert.equal($('p').val('ignored'), undefined);
    $('input,textarea').val('changed');
    $([$('textarea')[0], $('input')[0]]).val('text');
    return $.html();
  }, markup + '<input value="old"/><textarea>old text</textarea>');

  parity('input and textarea null values follow their respective setter semantics', $ => {
    $('input').val(null);
    $('textarea').val(null);
    return [attributes($, 'input'), $('textarea').text(), $.html()];
  }, '<input value="old"/><textarea>old text</textarea>');

  test(`positional selector lists fail explicitly instead of filtering the whole union (${label})`, () => {
    const $ = load(markup, options, false);
    try {
      for (const selector of ['#b, p:first', 'p, p:eq(0)', '#b, p:last'])
        assert.throws(() => $(selector), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
      assert.equal($('#a, #b').length, 2);
      assert.equal($('p:contains("one,two"):first').length, 0);
    } finally { $.dispose(); }
  });
}

test('XML form values preserve Cheerio truthiness for an empty multiple attribute', () => {
  const html = '<select multiple=""><option value="a" selected="">A</option><option value="b" selected="">B</option></select>';
  const $ = load(html, { xml: true }), c = cheerio(html, { xml: true });
  try {
    assert.equal($('select').val(), c('select').val());
    $('select').attr('multiple', 'multiple'); c('select').attr('multiple', 'multiple');
    assert.deepEqual($('select').val(), c('select').val());
  } finally { $.dispose(); }
});

test('URL property callbacks observe the stored value with a configured base URI', () => {
  const options = { baseURI: 'https://example.test/base/' };
  const $ = load('<a href="../guide">link</a>', options), c = cheerio('<a href="../guide">link</a>', options);
  const run = api => {
    const seen = [];
    api('a').prop('href', (index, old) => { seen.push([index, old]); return `${old}?next`; });
    return [seen, api('a').attr('href'), api('a').prop('href')];
  };
  try { assert.deepEqual(run($), run(c)); } finally { $.dispose(); }
});
