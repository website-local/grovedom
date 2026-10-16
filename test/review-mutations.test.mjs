import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const markup = '<main>text<!--note--><p id="a">one</p><p id="b">two</p></main>';

for (const xml of [false, true]) for (const execution of ['buffered', 'direct']) {
  const options = { xml, execution }, label = `xml=${xml}, ${execution}`;
  function parity(name, run, source = markup) {
    test(`${name} (${label})`, () => {
      const $ = load(source, options, false), c = cheerio(source, { xml }, false);
      try { assert.deepEqual(run($), run(c)); } finally { $.dispose(); }
    });
  }

  for (const cached of [false, true]) parity(`raw element data replacement, cached=${cached}`, $ => {
    const p = $('p').first();
    if (cached) p.data('value', 'old');
    let coercions = 0;
    const replacement = { value: 'new', toString() { coercions++; return 'coerced'; } };
    p[0].data = replacement;
    const same = p[0].data === replacement && p.data() === replacement;
    replacement.value = 'external';
    p.data('added', 42);
    return { same, value: p.data('value'), added: replacement.added, coercions, html: p.toString() };
  });

  parity('data property replacement follows each element own store', $ => {
    const selected = $('p'), first = selected.first(), second = selected.last();
    first.data('value', 'old');
    const replacement = { value: 'new' };
    selected.prop('data', replacement);
    const beforeRead = [first.prop('data') === replacement, second.prop('data'), second[0].data];
    const events = [];
    selected.prop('data', function (i, old) {
      events.push([i, this === selected[i], old === replacement ? 'store' : old]);
      return { value: `callback-${i}` };
    });
    return { beforeRead, events, first: first.data('value'), second: second.attr('data'), html: $.html() };
  });

  parity('raw data can be reset and replaced through a property map', $ => {
    const p = $('p').first();
    p[0].data = undefined;
    const replacement = { value: 7 };
    p.prop({ data: replacement });
    const same = p[0].data === replacement;
    p[0].data = null;
    const cleared = p[0].data;
    p.data('fresh', 8);
    return { same, cleared, fresh: p.data('fresh'), old: p.data('value'), html: p.toString() };
  });

  parity('text and comment data writes still change character data', $ => {
    const content = $('main').contents(), old = content.get().slice(0, 2);
    old[0].data = 'changed';
    old[1].data = 'updated comment';
    return [old.map(node => node.data), $('main').html(), content[0] === old[0]];
  });

  for (const method of ['append', 'prepend']) {
    parity(`root ${method} callback sees preceding writes`, $ => {
      const root = $.root(), events = [];
      $('p').first().text('updated');
      assert.equal(root[method](function (i, html) {
        events.push([i, this === root[0], this.type, html]);
        return '<b>inserted</b>';
      }), root);
      return { events, html: $.html() };
    });

    parity(`mixed root ${method} callbacks keep original indices and snapshots`, $ => {
      const main = $('main'), selected = $([main.contents()[0], $.root()[0], main[0]]), events = [];
      const before = selected.get();
      selected[method](function (i, html) {
        events.push([i, this === before[i], html]);
        return '<b>' + i + '</b>';
      });
      return { events, same: selected.get().every((node, i) => node === before[i]), html: $.html() };
    });

    if (!xml) parity(`template fragment ${method} callback accepts its root`, $ => {
      const roots = $('template').contents(), events = [], before = roots.get();
      roots[method](function (i, html) {
        events.push([i, this === before[i], this.type, html]);
        return '<b>' + i + '</b>';
      });
      return { events, html: $.html() };
    }, '<main><template><p>one</p></template><template><p>two</p></template></main>');
  }

  for (const method of ['append', 'prepend', 'before', 'after']) {
    parity(`callback-first ${method} ignores later arguments`, $ => {
      const selected = $('p'), events = [];
      selected[method](function (i, html) {
        events.push([i, this === selected[i], html, selected.first().text()]);
        return '<b>' + i + '</b>';
      }, '<i>ignored</i>', { toString() { throw new Error('ignored argument was used'); } });
      return { events, html: $.html() };
    });

    parity(`callback-first ${method} preserves partial effects on failure`, $ => {
      const selected = $('p'), events = [], sentinel = new Error('callback failed');
      assert.throws(() => selected[method](function (i, html) {
        events.push([i, html]);
        $(this).attr('visited', i);
        if (i === 1) throw sentinel;
        return '<b>kept</b>';
      }, '<i>ignored</i>'), error => error === sentinel);
      return { events, html: $.html() };
    });
  }

  for (const method of ['before', 'after']) parity(`${method} callback skips text and the document root`, $ => {
    const selected = $([$.root()[0], $('main').contents()[0], $('p')[0]]), events = [];
    selected[method](function (i, html) { events.push([i, html]); return '<b>added</b>'; });
    return { events, html: $.html() };
  });

  for (const wrapper of [
    '<div><script></script><section></section></div>',
    '<div><style></style><section></section></div>',
    '<div><!--skip-->text<script></script><style></style></div>',
    '<div><section><script></script><em></em></section><aside></aside></div>',
    '<div><section><style></style><em></em></section><aside></aside></div>',
    '<div><section></section></div>',
    '<div><Script></Script><section></section></div>',
    '<script></script><div><section></section></div><style></style>',
  ]) parity(`wrapAll descends to the first tag child in ${wrapper}`, $ => {
    const selected = $('p'), before = selected.get();
    selected.wrapAll(wrapper);
    return { parent: selected.first().parent()[0].name, html: $.html(), same: selected.get().every((node, i) => node === before[i]) };
  });

  for (const selector of [
    'p/* :contains( */',
    'p/* " */:contains(one)',
    'p/* [ */:contains(one)',
    'p/* \\ */:contains(one)',
    ':is(p/* :contains( [ " */:contains(one), #b)',
    'p/* :checked ] */:contains(one)/* " [ */',
    'p:contains("one/* [ :checked */")',
    'p[data-x="/* :contains( */"]:contains(one)',
  ]) parity(`selector aliases ignore comments: ${selector}`, $ => {
    const main = $('main');
    return [$(selector).get().map(node => node.attribs.id), main.find(selector).length,
      $('p').filter(selector).get().map(node => node.attribs.id), $('p').is(selector), $(selector).length];
  }, '<main><p id="a" data-x="/* :contains( */">one/* [ :checked */</p><p id="b">two</p></main>');

  test(`element data and root callback writes respect disposal (${label})`, () => {
    const $ = load(markup, options, false), node = $('p')[0];
    try {
      const store = { kept: 1 };
      node.data = store;
      assert.throws(() => $.root().append(() => { $.dispose(); return '<b>late</b>'; }), { code: 'ERR_GROVEDOM_DISPOSED' });
      assert.throws(() => { node.data = {}; }, { code: 'ERR_GROVEDOM_DISPOSED' });
      assert.throws(() => node.data, { code: 'ERR_GROVEDOM_DISPOSED' });
      assert.deepEqual(store, { kept: 1 });
    } finally { $.dispose(); }
  });
}
