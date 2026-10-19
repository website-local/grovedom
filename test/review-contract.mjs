import assert from 'node:assert/strict';

function sameNodes(actual, expected) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) assert.equal(actual[i], expected[i]);
}

// The same corrections must reach installed packages and the portable facade.
export const reviewCases = [
  {
    name: 'repeated sibling insertion preserves one physical node and reciprocal links', corrected: true,
    run({ load }, execution) {
      for (const xml of [false, true]) {
        const $ = load('<main><p id="a"></p><p id="b"></p><p id="c"></p></main>', { xml, execution });
        try {
          const main = $('main'), [a, b, c] = $('p').get(), retained = $([b, b]);
          $(b).attr('pending', 'kept');
          $(a).after(retained);
          sameNodes(main.children().get(), [a, b, c]);
          assert.equal(b.parent, main[0]);
          assert.equal(a.next, b); assert.equal(b.prev, a);
          assert.equal(b.next, c); assert.equal(c.prev, b);
          sameNodes($(b).nextAll().get(), [c]);
          sameNodes($(b).prevAll().get(), [a]);
          $(a).after([c, b, b]);
          sameNodes(main.children().get(), [a, c, b]);
          sameNodes(retained.get(), [b, b]);
          assert.equal($(b).attr('pending'), 'kept');
          assert.equal(b.next, null); assert.equal(b.prev, c);
        } finally { $.dispose(); }
      }
    },
  },
  {
    name: 'add rejects foreign query contexts without reinterpreting their IDs', corrected: true,
    run({ load }, execution) {
      for (const xml of [false, true]) {
        const a = load('<main><p id="local"><i id="local-child"></i></p></main>', { xml, execution });
        const b = load('<main><p id="foreign"></p></main>', { xml, execution });
        try {
          const local = a('p'), foreign = b('main'), child = a('i')[0];
          local.attr('pending', 'kept');
          for (const context of [foreign, foreign[0]]) for (const selector of ['p', 'missing']) {
            assert.throws(() => local.add(selector, context).attr('wrong', 'changed'), error => error?.name === 'TypeError');
            assert.equal(child.attribs.wrong, undefined);
            assert.equal(local.attr('wrong'), undefined);
            assert.equal(b('p').attr('wrong'), undefined);
          }
          // Bare context queries deliberately return the foreign owner's nodes.
          assert.equal(a('p', foreign)[0], b('p')[0]);
          const joined = local.add('i', a('main'));
          sameNodes(joined.get(), [local[0], child]);
          assert.equal(joined.end(), local);
          assert.equal(local.attr('pending'), 'kept');
          b.dispose();
          assert.throws(() => local.add('p', foreign), { code: 'ERR_GROVEDOM_DISPOSED' });
          assert.equal(a('i')[0], child);
        } finally { a.dispose(); b.dispose(); }
      }
    },
  },
  {
    name: 'contents and adjacent traversal preserve occurrences and callback indices', corrected: true,
    run({ load }, execution) {
      for (const xml of [false, true]) {
        const $ = load('<main><p><i>A</i>tail</p><p><i>B</i>end</p><p>C</p></main>', { xml, execution });
        try {
          const [a, b, c] = $('p').get(), repeated = $([a, b, a]);
          const expected = [...$(a).contents(), ...$(b).contents(), ...$(a).contents()];
          sameNodes(repeated.contents().get(), expected);
          assert.equal(repeated.contents().end(), repeated);
          for (const filter of [undefined, 'p']) {
            sameNodes(repeated.next(filter).get(), [b, c, b]);
            sameNodes($([b, c, b]).prev(filter).get(), [a, b, a]);
          }
          const seen = [];
          sameNodes(repeated.next(function (i, node) {
            assert.equal(this, node); seen.push([i, node]); return i !== 1;
          }).get(), [b, b]);
          assert.equal(seen.length, 3);
          for (let i = 0; i < seen.length; i++) { assert.equal(seen[i][0], i); assert.equal(seen[i][1], [b, c, b][i]); }
          sameNodes(repeated.next(':odd').get(), [c]);
          sameNodes(repeated.parent().get(), [$('main')[0]]);
          $(a).remove();
          sameNodes(repeated.contents().get(), expected);
        } finally { $.dispose(); }
      }
    },
  },
  {
    name: 'single-select null values preserve selection and pending edits', corrected: true,
    run({ load }, execution) {
      for (const xml of [false, true]) for (const nullOption of ['', '<option value="null">null</option>']) {
        const $ = load('<select><option value="x" selected="selected">x</option>' + nullOption + '</select>', { xml, execution });
        try {
          const selected = $('select'), options = $('option').get();
          selected.attr('pending', 'kept');
          assert.equal(selected.val(null), selected);
          assert.equal(selected.val(), 'x');
          sameNodes($('option:selected').get(), [options[0]]);
          assert.equal(selected.attr('pending'), 'kept');
          selected.val([]);
          assert.equal(selected.val(), 'x');
          selected.attr('multiple', 'multiple').val(['x']);
          assert.equal(JSON.stringify(selected.val()), JSON.stringify(['x']));
        } finally { $.dispose(); }
      }
    },
  },
  {
    name: 'sparse and dense relative unions keep disjoint and overlapping root order', corrected: true,
    run({ load }, execution) {
      for (const xml of [false, true]) for (const width of [1, 16, 17, 80]) {
        const block = prefix => Array.from({ length: width }, (_, i) =>
          `<p id="${prefix}p${i}"></p><div><b id="${prefix}b${i}"></b></div>`).join('');
        const $ = load('<main><section id="left">' + block('l') + '</section><section id="right">' + block('r') + '</section></main>', { xml, execution });
        try {
          const left = $('#left'), right = $('#right'), forward = $('p, b').get();
          const roots = $([right[0], left[0], right[0]]);
          const expected = [...right.find('p, b').get(), ...left.find('p, b').get()];
          const snapshot = roots.find('b, > p');
          sameNodes(snapshot.get(), expected);
          sameNodes(roots.find('> p, b').get(), expected);
          const overlapping = $([right[0], $('main')[0], left[0]]);
          sameNodes(overlapping.find('> section, p, b').get(), [left[0], ...forward.slice(0, width * 2), right[0], ...forward.slice(width * 2)]);
          sameNodes(roots.find('p, b').get(), expected);
          left.empty();
          sameNodes(snapshot.get(), expected);
          assert.equal(snapshot.end(), roots);
          const inserted = $('<article><p>inside fragment</p></article>');
          right.prepend(inserted[0].parent);
          const contexts = $([right[0], left[0], inserted[0]]);
          sameNodes(contexts.find('> p, p').get(), [inserted.find('p')[0], ...right.children('p').get()]);
        } finally { $.dispose(); }
      }
    },
  },
  {
    name: 'repeated raw data writes preserve coercion, stores and disposal', corrected: true,
    run({ load }, execution) {
      for (const xml of [false, true]) {
        const $ = load('<main>text<p>before</p></main>', { xml, execution });
        try {
          const main = $('main'), text = main.contents()[0], p = $('p');
          text.data = 'cached';
          const store = { value: 1 };
          for (let i = 0; i < 80; i++) { text.data = String(i); p[0].data = store; }
          assert.equal(text.data, '79');
          assert.equal(p[0].data, store);
          p.text('queued');
          text.data = { toString() {
            assert.equal(p.text(), 'queued');
            text.data = 'inner';
            main.append('<b>added</b>');
            return 'outer';
          } };
          assert.equal(text.data, 'outer');
          assert.equal(main.find('b').text(), 'added');
          assert.throws(() => { text.data = { toString() { $.dispose(); return 'late'; } }; }, { code: 'ERR_GROVEDOM_DISPOSED' });
          assert.throws(() => { p[0].data = {}; }, { code: 'ERR_GROVEDOM_DISPOSED' });
        } finally { $.dispose(); }
      }
    },
  },
  {
    name: 'new attribute names preserve exact spelling and lowercase roles', corrected: true,
    run({ load }, execution) {
      for (const xml of [false, true]) {
        const $ = load('<main><p id="old" class="original">one</p><svg></svg></main>', { xml, execution }, false);
        try {
          const p = $('p'), node = p[0];
          p.attr({ ID: 'new', CLASS: 'added' });
          assert.equal($('#old')[0], node);
          assert.equal($('.original')[0], node);
          assert.equal($('#new').length, 0);
          assert.equal(p.clone().toString(), '<p id="old" class="original" ID="new" CLASS="added">one</p>');
          $('svg').attr('viewBox', '0 0 1 1').removeAttr('viewBox').attr('viewBox', '0 0 2 2');
          assert.equal($('svg').attr('viewBox'), '0 0 2 2');
          assert.match($('svg').toString(), /viewBox="0 0 2 2"/);
        } finally { $.dispose(); }
      }
    },
  },
  {
    name: 'data replacement and root insertion callbacks keep their contracts', corrected: true,
    run({ load }, execution) {
      for (const xml of [false, true]) {
        const $ = load('<main><p>one</p></main>', { xml, execution }, false);
        try {
          const p = $('p'), original = { value: 1 }, replacement = { value: 2 };
          p[0].data = original;
          assert.equal(p.data(), original);
          p.prop('data', replacement);
          assert.equal(p.data(), replacement);
          assert.equal(p.attr('data'), undefined);
          let calls = 0;
          $.root().prepend(function (i, html) {
            calls++;
            assert.equal(i, 0);
            assert.equal(this, $.root()[0]);
            assert.equal(html, '<main><p>one</p></main>');
            return '<b>first</b>';
          }, '<i>ignored</i>');
          assert.equal(calls, 1);
          assert.equal($.html(), '<b>first</b><main><p>one</p></main>');
          if (!xml) {
            $('main').append('<template><em>inside</em></template>');
            $('template').contents().append(function (i, html) {
              assert.equal(html, '<em>inside</em>');
              return '<strong>added</strong>';
            });
            assert.equal($('template').html(), '<em>inside</em><strong>added</strong>');
          }
        } finally { $.dispose(); }
      }
    },
  },
  {
    name: 'commented aliases and wrapAll choose the intended elements', corrected: true,
    run({ load }, execution) {
      const $ = load('<main><p>one</p><p>two</p></main>', { execution }, false);
      try {
        assert.equal($('p/* :contains( */').length, 2);
        assert.equal($('p/* " [ */:contains(one)').text(), 'one');
        const selected = $('p'), first = selected[0];
        selected.wrapAll('<div><script></script><style></style><section></section></div>');
        assert.equal(selected.first().parent()[0].name, 'section');
        assert.equal($('section > p')[0], first);
        assert.equal($('script').html(), '');
        assert.equal($('style').html(), '');
      } finally { $.dispose(); }
    },
  },
];
