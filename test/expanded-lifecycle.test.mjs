import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../src/index.js';
import { load as cheerio } from 'cheerio';
import { kernel } from '../src/kernel.js';

test('clone identity, raw fields, rename, and retained removed nodes survive mutation', () => {
  const $ = load('<main><p id="a">first<!--old--></p><p id="b">second</p></main>');
  try {
    const first = $('#a')[0], text = $('#a').contents()[0], comment = $('#a').contents()[1];
    const clone = $('#a').clone();
    assert.notEqual(clone[0], first);
    assert.notEqual(clone.contents()[0], text);
    clone.attr('id', 'clone').appendTo('main');
    first.name = 'section';
    assert.equal($('section')[0], first);
    text.data = 'updated'; comment.data = 'new';
    first.attribs.title = 'hello'; delete first.attribs.id;
    assert.equal($('section').toString(), '<section title="hello">updated<!--new--></section>');
    assert.equal($('#clone').text(), 'first');
    $(first).remove();
    assert.equal(first.parent, null);
    assert.equal($(first).text(), 'updated');
    assert.equal($('p').map((i, node) => node).addClass('mapped').length, 2);
  } finally { $.dispose(); }
  assert.equal(kernel.stats().liveBytes, 0);
});

test('node movement, wrapping, until traversal, and form/extract helpers match Cheerio', () => {
  const transform = loader => {
    const $ = loader('<main><i>A</i><b>B</b><i>C</i></main><form><input name="q" value="a b"></form>');
    try {
      const first = $('i').first(), second = $('i').last();
      second.insertBefore(first);
      first.wrapAll('<section><div></div></section>');
      $('b').wrapInner('<em></em>');
      $('em').unwrap();
      const text = $('main').children().first().nextUntil('section').text();
      return [$.html(), text, $('form').serialize(), $.extract({ values: ['i'] })];
    } finally { $.dispose?.(); }
  };
  assert.deepEqual(transform(load), transform(cheerio));
});
