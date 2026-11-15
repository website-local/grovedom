import test from 'node:test';
import assert from 'node:assert/strict';
import { load, loadFast } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

for (const [mode, loader] of [['compatible', load], ['fast', loadFast]]) {
  for (const execution of ['buffered', 'direct']) {
    const label = `${mode}, ${execution}`;

    for (const xml of [false, true]) {
      test(`simple scalar compounds preserve matching and mutation semantics (${label}, xml=${xml})`, () => {
        const source = '<main><p id="a" class="on extra" data-x=""></p><p id="b" class="off"></p><Item id="c" class="on" data-x="yes"/></main>';
        const $ = loader(source, { execution, xml }), expected = cheerio(source, { xml });
        const selectors = ['*', 'p', '.on', '#a', '[data-x]', 'p.on[data-x]', '*#a.extra',
          '[data-x].on', 'Item.on', 'item.on', '.missing', '[missing]', 'p:first', 'p:last',
          'p, Item', ':is(.on,.off)', '[data-x="yes"]', '.o\\6e', ':not(.on)'];
        const compare = () => {
          for (const list of ['main > *', '#a', '#b', '#c', '.missing']) {
            for (const selector of selectors) {
              assert.equal($(list).is(selector), expected(list).is(selector), `${list}: ${selector}`);
            }
          }
        };
        try {
          compare();
          for (const open of [$, expected]) open('#b').attr('class', 'on').attr('data-x', 'new');
          compare();
          for (const open of [$, expected]) open('#a').removeAttr('class data-x');
          compare();
        } finally { $.dispose(); }
      });

      test(`direct has keeps find semantics, duplicate roots and chain history (${label}, xml=${xml})`, () => {
        const $ = loader('<main><section id="a"><b>A</b></section><section id="b"></section>' +
          '<template><section id="c"><b>C</b></section></template></main>', { execution, xml });
        try {
          const roots = $('section').get(), list = $([roots[0], ...roots.slice().reverse(), roots[0]]);
          for (const selector of ['', 'b', '> b', ':scope > b', 'b:first', ':contains(A)', 'b, i', '[missing]']) {
            const expected = list.filter(function () { return $(this).find(selector).length > 0; });
            const actual = list.has(selector);
            assert.deepEqual(actual.get().map(n => n.attribs.id), expected.get().map(n => n.attribs.id), selector);
            assert.ok(actual.end() === list);
          }
          assert.equal($('.absent').has('[').length, 0);
          assert.throws(() => list.has('['), { code: 'ERR_GROVEDOM_SELECTOR' });
        } finally { $.dispose(); }
      });
    }

    test(`select values observe sparse lists and coercion before resolving options (${label})`, () => {
      const options = Array.from({ length: 80 }, (_, i) => `<option id="o${i}"${i % 9 ? ` value="v${i}"` : ''}>${i}</option>`).join('');
      const source = `<select id="a" multiple>${options}</select><select id="b" multiple>${options.replaceAll('id="o', 'id="b')}</select>`;
      const run = $ => {
        const list = $('#a'), values = new Array(64), events = [];
        values[0] = { toString() {
          events.push('convert');
          list.splice(0, 1, $('#b').get(0));
          $('#b').append('<option id="late" value="late">later</option>');
          return 'late';
        } };
        Object.defineProperty(values, 2, { get() { events.push('get2'); return 'v2'; } });
        values[63] = 'v79';
        const returned = list.val(values);
        assert.ok(returned === list);
        return { events, selected: $('option[selected]').get().map(n => n.attribs.id) };
      };
      const $ = loader(source, { execution });
      // GroveDOM preserves sparse undefined membership; Cheerio instead builds
      // a selector per value. Keep the existing GroveDOM contract explicit.
      try { assert.deepEqual(run($), { events: ['convert', 'get2'],
        selected: ['b0', 'b2', 'b9', 'b18', 'b27', 'b36', 'b45', 'b54', 'b63', 'b72', 'b79', 'late'] }); }
      finally { $.dispose(); }
    });

    test(`select value loops retain object, callback and small-list behavior (${label})`, () => {
      const source = '<select><option value="a" selected>A</option><option value="b">B</option></select>' +
        '<select multiple><option value="a">A</option><option value="b">B</option></select><textarea>old</textarea>';
      const run = $ => {
        $('select').first().val(['b']);
        $('select').last().val(['a', 'b', 'a']);
        $('select').val(function (i, value) { return i ? ['b'] : value; });
        $('textarea').val({ toString() { return 'new'; } });
        return { selected: $('option').get().map(n => n.attribs.selected !== undefined), text: $('textarea').text() };
      };
      const $ = loader(source, { execution });
      // Value callbacks are a supported convenience extension.
      try { assert.deepEqual(run($), { selected: [true, false, false, true], text: 'new' }); }
      finally { $.dispose(); }
    });

    test(`array extraction preserves descriptors, flattening, callbacks and nested values (${label})`, () => {
      const source = '<main><article id="a"><a href="one">A<b>bold</b></a></article>' +
        '<article id="b"><a href="two">B</a></article></main>';
      const run = $ => {
        const events = [], inherited = { inherited: ['article'] };
        const map = Object.assign(Object.create(inherited), {
          title: { selector: 'main', value: 'textContent' },
          links: [{ get selector() { events.push('selector'); return 'a'; },
            get value() { events.push('value'); return 'href'; } }],
          nested: [{ selector: 'article', value: { text: 'a', inner: { selector: 'a', value: 'innerHTML' } } }],
          callbacks: [{ selector: 'article', value(node, key, result) {
            events.push([node.attribs.id, key, result.title]);
            $(node).remove();
            return node.attribs.id === 'a' ? [null, undefined, false, 'A'] : 'B';
          } }],
          empty: ['article'],
        });
        return { output: $.extract(map), events };
      };
      const $ = loader(source, { execution, baseURI: 'https://example.test/base/' });
      try { assert.deepEqual(run($), run(cheerio(source, { baseURI: 'https://example.test/base/' }))); }
      finally { $.dispose(); }
    });

    test(`extraction rechecks disposal between callbacks and preserves a final callback result (${label})`, () => {
      for (const count of [1, 2]) {
        const $ = loader('<p>one</p>'.repeat(count), { execution });
        let calls = 0;
        try {
          const run = () => $.extract({ values: [{ selector: 'p', value() { calls++; $.dispose(); return 'kept'; } }] });
          if (count === 1) assert.deepEqual(run(), { values: ['kept'] });
          else assert.throws(run, { code: 'ERR_GROVEDOM_DISPOSED' });
          assert.equal(calls, 1);
        } finally { $.dispose(); }
      }
    });

    test(`closest preserves first occurrence order across large distinct and duplicate results (${label})`, () => {
      const $ = loader('<main>' + Array.from({ length: 96 }, (_, i) => `<section id="s${i}"><b></b><i></i></section>`).join('') + '</main>', { execution });
      try {
        const nodes = $('b,i').get().reverse(), list = $([...nodes, ...nodes]);
        const result = list.closest('section');
        assert.deepEqual(result.get().map(n => n.attribs.id), Array.from({ length: 96 }, (_, i) => `s${95 - i}`));
        assert.ok(result.end() === list);
        assert.equal(list.closest('section', $('section').last().get(0)).length, 95);
      } finally { $.dispose(); }
    });

    test(`large class removal preserves duplicate tokens, per-node getters and unchanged spelling (${label})`, () => {
      const tokens = Array.from({ length: 64 }, (_, i) => `c${i}`), requested = tokens.slice(0, 40);
      const source = `<p class="  ${tokens.concat(tokens.slice(0, 4)).join('  ')}  "></p>`.repeat(2);
      const run = $ => {
        const list = $('p'), events = [];
        const missing = requested.map(x => `missing-${x}`).join(' ');
        list.removeClass(missing);
        const unchanged = list.first().attr('class');
        const value = requested.slice();
        Object.defineProperty(value, 0, { get() { events.push('read'); return events.length === 1 ? 'c60' : 'c61'; } });
        list.removeClass(value);
        list.removeClass(tokens.slice(40).join(' '));
        return { unchanged, events, classes: list.get().map(n => n.attribs.class) };
      };
      const $ = loader(source, { execution });
      // Array class inputs extend Cheerio's string/callback API.
      try { assert.deepEqual(run($), { unchanged: '  ' + tokens.concat(tokens.slice(0, 4)).join('  ') + '  ',
        events: ['read', 'read'], classes: ['c0 c0', 'c0 c0'] }); }
      finally { $.dispose(); }
    });

    test(`large callback filters keep snapshots and duplicate visits across selection edits (${label})`, () => {
      const $ = loader('<p id="a"></p><p id="b"></p><p id="c"></p>', { execution });
      try {
        const [a, b, c] = $('p').get(), list = $(Array.from({ length: 128 }, (_, i) => i % 2 ? b : a));
        const visits = [];
        const result = list.filter(function (i, node) {
          assert.ok(this === node);
          visits.push(node.attribs.id);
          if (i === 0) list.splice(0, 128, c);
          return i % 31 === 0;
        });
        assert.deepEqual(visits, Array.from({ length: 128 }, (_, i) => i % 2 ? 'b' : 'a'));
        assert.deepEqual(result.get().map(n => n.attribs.id), ['a', 'b', 'a', 'b', 'a']);
        assert.ok(result.end() === list);
        assert.deepEqual(list.get().map(n => n.attribs.id), ['c']);
        assert.equal(result.not(() => true).length, 0);
      } finally { $.dispose(); }
    });
  }
}

for (const execution of ['buffered', 'direct']) {
  test(`no-op numeric assignment still validates ownership and snapshots (${execution})`, () => {
    const $ = load('<p id="a"></p><p id="b"></p>', { execution }), other = load('<p/>');
    try {
      const list = $('p'), first = list.first(), [a, b] = list.get(), events = [];
      list[0] = a;
      assert.ok(first.get(0) === a);
      list[0] = b;
      assert.ok(first.get(0) === a && list.get(0) === b);
      const incoming = [];
      Object.defineProperty(incoming, 0, { get() { events.push('get'); list.splice(0, 1, a); return b; } });
      list[0] = incoming;
      assert.deepEqual(events, ['get']);
      assert.ok(list.get(0) === b && first.get(0) === a);
      assert.throws(() => { list[0] = other('p').get(0); }, TypeError);
      assert.throws(() => { list[9] = b; }, TypeError);
      assert.throws(() => { list[0] = []; }, TypeError);
    } finally { $.dispose(); other.dispose(); }
  });
}
