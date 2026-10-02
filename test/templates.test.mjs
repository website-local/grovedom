import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../src/index.js';
import { load as cheerio } from 'cheerio';
import { kernel } from '../src/kernel.js';

const source = '<main><template id="outer"><p>A &amp; B</p><template id="inner"><b>C</b></template><!--tail--></template><p>D</p></main>';
function compare(run, execution, html = source) {
  const $ = load(html, { execution }), c = cheerio(html);
  try { assert.deepEqual(run($), run(c)); }
  finally { $.dispose(); }
}
for (const execution of ['direct', 'buffered']) {
  test(`${execution}: template serialization and reads preserve structure`, () => {
    for (const run of [
      $ => $.html(), $ => $.text(), $ => $('#outer').html(),
      $ => $('#outer').toString(), $ => $('#outer').contents().html(),
      $ => $('#outer').contents().toString(), $ => $('#outer').clone().toString(),
      $ => $('#outer').contents().clone().toString(),
    ]) compare(run, execution);
    const $ = load(source, { execution });
    try {
      const expected = $.html(), fragment = $('#outer').contents()[0];
      for (let i = 0; i < 4; i++) { $('#outer').html(); assert.equal($.html(), expected); }
      assert.equal(fragment, $('#outer').contents()[0]);
      assert.equal(fragment.parent, $('#outer')[0]);
      assert.equal(fragment.type, 'root');
      assert.equal(fragment.nodeType, 9);
    } finally { $.dispose(); }
  });

  test(`${execution}: template queries and traversal respect fragment boundaries`, () => {
    compare($ => [
      $('p, b, template').map((i, node) => node.name).get(),
      $('#outer').find('*').length, $('#outer').children().length,
      $('#outer').contents().find('*').map((i, node) => node.name).get(),
      $('template p').length, $('template > p').length,
      $('b').parents().length, $('b').parent().length,
      $('b').closest('template').length, $('b').is('main b'),
      $.contains($('#outer')[0], $('b')[0]),
    ], execution);
  });

  test(`${execution}: template mutation, cloning, fragment parsing and moving`, () => {
    for (const method of ['append', 'prepend', 'html', 'text']) compare($ => {
      $('#outer')[method]('<i>new</i>'); return $.html();
    }, execution);
    compare($ => {
      const contents = $('#outer').contents();
      contents.append('<table><tr><td>cell</td></tr></table>');
      contents.children('p').attr('title', 'changed');
      $('#outer').clone().attr('id', 'copy').appendTo('main');
      $('<template><span>fresh</span></template>').prependTo('main');
      $('main').append('<template><em>buffered</em></template>');
      $('#inner').remove().appendTo('main');
      return [$.html(), $.text()];
    }, execution);
  });

  test(`${execution}: retained template descendants survive replacement and renaming`, () => {
    const $ = load(source, { execution });
    const old = $('#outer').contents(), text = old.children('p').contents()[0];
    try {
      $('#outer').empty();
      assert.equal(old[0].parent, null);
      assert.equal($(text).text(), 'A & B');
      old.append('<i>retained</i>');
      assert.equal(old.find('i').text(), 'retained');
      $('main').append(old);
      assert.equal(old[0].parent, $('main')[0]);
      const node = $('#outer')[0];
      node.name = 'section';
      assert.equal($('section')[0], node);
      node.name = 'template';
      $(node).html('<b>renamed</b>');
      assert.equal($(node).toString(), '<template id="outer">renamed</template>');
    } finally { $.dispose(); }
    assert.throws(() => old.text(), { code: 'ERR_GROVEDOM_DISPOSED' });
    assert.equal(kernel.stats().liveBytes, 0);
  });
}

test('template replacement reuses pools and releases every backing allocation', () => {
  const $ = load('<main></main>', { execution: 'direct' }), main = $('main');
  try {
    for (let i = 0; i < 100; i++) main.html(source);
    const before = kernel.stats();
    for (let i = 0; i < 1000; i++) main.html(source);
    assert.equal(kernel.stats().liveBytes, before.liveBytes);
    assert.equal(main.find('b').text(), 'C');
  } finally { $.dispose(); }
  assert.equal(kernel.stats().liveBytes, 0);
});

test('deep template cloning and serialization do not recurse on the C stack', () => {
  const html = '<template>'.repeat(1000) + '<b>deep</b>' + '</template>'.repeat(1000);
  const $ = load(html, {}, false);
  try {
    assert.equal($.html(), html);
    assert.equal($.root().children().clone().toString(), html);
    assert.equal($('b').text(), 'deep');
  } finally { $.dispose(); }
});

test('unsupported template-sensitive pseudos fail explicitly, including nested plans', () => {
  const $ = load(source);
  try {
    for (const selector of ['template:has(p)', ':empty', ':not(:empty)', ':is(main, :has(p))', ':nth-child(1 of :empty)']) {
      assert.throws(() => $(selector), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
    }
    assert.equal($('b').text(), 'C');
  } finally { $.dispose(); }
});
