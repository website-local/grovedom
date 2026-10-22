import assert from 'node:assert/strict';

function sameNodes(actual, expected) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) assert.equal(actual[i], expected[i]);
}

// The same corrections must reach installed packages and the portable facade.
export const reviewCases = [
  {
    name: 'until traversal retains duplicate filter visits and follows callback edits', corrected: true,
    run({ load }, execution) {
      for (const xml of [false, true]) {
        const $ = load('<main><p id="a">A</p>text<p id="b">B</p><p id="c">C</p><p id="d">D</p></main>', { xml, execution });
        try {
          const [a, b, c, d] = $('p').get(), selected = $([a, a]), visits = [];
          sameNodes(selected.nextUntil('#d').get(), [b, c]);
          sameNodes(selected.nextUntil($(d)).get(), [b, c]);
          sameNodes(selected.nextUntil(undefined, ':eq(3)').get(), [b]);
          const result = selected.nextUntil(function (i, node) {
            visits.push([i, node === this, this.attribs.id]);
            if (!i) $(c).remove();
            return this === d;
          });
          assert.equal(JSON.stringify(visits), JSON.stringify([[0, true, 'b'], [1, true, 'd'], [1, true, 'b'], [2, true, 'd']]));
          sameNodes(result.get(), [b]);
          assert.equal(result.end(), selected);
          $('main').empty();
          sameNodes(result.get(), [b]);
          assert.equal(b.name, 'p');
        } finally { $.dispose(); }
      }
    },
  },
  {
    name: 'enumerated attribute views stay live through nested writes and disposal', corrected: true,
    run({ load }, execution) {
      const $ = load('<i a="one" b="two"></i>', { execution }), item = $('i'), view = item[0].attribs;
      try {
        assert.equal(Object.keys(view).join(','), 'a,b');
        const copy = item.attr(); copy.a = 'external';
        assert.equal(view.a, 'one');
        const target = { set a(_) { item.attr('b', 'changed'); } };
        Object.assign(target, view);
        assert.equal(target.b, 'changed');
        item.prop('tagName', 'span').attr('c', 'new');
        assert.equal(view.c, 'new');
        assert.equal(Object.getOwnPropertyDescriptor(view, 'b').value, 'changed');
        Object.keys(view);
        view.__proto__ = 'own'; delete view.a;
        assert.equal(view.__proto__, 'own'); assert.equal(view.a, undefined);
        Object.keys(view); $.dispose();
        assert.throws(() => view.b, { code: 'ERR_GROVEDOM_DISPOSED' });
      } finally { $.dispose(); }
    },
  },
  {
    name: 'containment preserves raw fragment ancestry and follows buffered moves', corrected: true,
    run({ load, contains }, execution) {
      const $ = load('<main></main><aside></aside>', { execution }), other = load('<p></p>');
      try {
        const main = $('main')[0], aside = $('aside')[0], node = $('<p>text</p>')[0], fragment = node.parent;
        $(main).append(fragment);
        assert.equal(contains(main, node), true); assert.equal(contains(fragment, node), true);
        assert.equal(contains(node, node), false); assert.equal(contains(main, other('p')[0]), false);
        $(aside).append(node);
        assert.equal($.contains(main, node), false); assert.equal($.contains(aside, node), true);
        $(aside).remove(); assert.equal($.contains(aside, node), true);
        $.dispose(); assert.throws(() => contains(aside, node), { code: 'ERR_GROVEDOM_DISPOSED' });
      } finally { $.dispose(); other.dispose(); }
    },
  },
  {
    name: 'borrowed callback IDs and empty edit inputs cannot reuse previous operands', corrected: true,
    run({ load }, execution) {
      for (const xml of [false, true]) {
        const $ = load('<main><p id="a">A</p><p id="b">B</p></main>', { xml, execution });
        try {
          const saved = [];
          $('p').attr('x', function (i) {
            saved.push($(this));
            return { toString() { $('#b').attr('inner', () => 'nested'); return String(i); } };
          });
          assert.equal(saved[0].attr('x'), '0'); assert.equal(saved[1].attr('x'), '1');
          const text = saved[0].contents()[0];
          $('#b'); saved[0].after(saved[1]); saved[0].prepend(''); text.data = '';
          assert.equal(saved[0].text(), ''); assert.equal(saved[1].text(), 'B');
          saved[0].text('restored');
          assert.equal(saved[0].text(), 'restored'); assert.equal(text.data, '');
          sameNodes($('p').get(), saved.map(value => value[0]));
        } finally { $.dispose(); }
      }
    },
  },
  {
    name: 'ordinary find retains explicit contexts on both sides of a raw fragment', corrected: true,
    run({ load }, execution) {
      for (const xml of [false, true]) for (const template of (xml ? [false] : [false, true])) {
        const $ = load('<main><b id="outside">out</b></main>' + (template && !xml ? '<template></template>' : ''), { xml, execution });
        try {
          const main = $('main')[0], article = $('<article><b id="inside">in</b></article>')[0], fragment = article.parent;
          $(main).append(fragment);
          const inside = $(article).find('b')[0], outside = $('#outside')[0];
          for (const roots of [[main, article], [article, main], [main, fragment, article], [fragment, main, article], [main, fragment, fragment], [$.root()[0], fragment]]) {
            const selected = $(roots);
            const expected = roots[0] === article || roots[0] === fragment ? [inside, outside] : [outside, inside];
            for (const selector of ['b', 'b[id]', ':is(b)', 'b:contains(in)', 'b, b[id]']) {
              const found = selected.find(selector).get();
              sameNodes(found, selector === 'b:contains(in)' ? [inside] : expected);
            }
          }
          $(main).empty();
          assert.equal($(article).find('b')[0], inside);
          assert.equal(inside.parent, article);
        } finally { $.dispose(); }
      }
    },
  },
  {
    name: 'raw child edges retain exact mixed-content identity through replacement', corrected: true,
    run({ load }, execution) {
      for (const xml of [false, true]) {
        const $ = load('<main>first<!--middle--><i>inner</i>last</main>' + (xml ? '' : '<template><b>content</b></template>'), { xml, execution });
        try {
          const main = $('main'), node = main[0], first = node.firstChild, last = node.lastChild;
          assert.equal(first.data, 'first'); assert.equal(last.data, 'last');
          const children = node.children;
          assert.equal(first, children[0]); assert.equal(last, children.at(-1));
          assert.equal(first.firstChild, null); assert.equal(first.lastChild, null);
          main.html('replacement<!--tail-->');
          const next = node.firstChild, tail = node.lastChild;
          assert.equal(next.data, 'replacement'); assert.equal(tail.type, 'comment');
          assert.equal(main.prop('firstChild'), next); assert.equal(main.prop('lastChild'), tail);
          assert.equal(first.data, 'first'); assert.equal(last.data, 'last');
          assert.equal(children[0], first); assert.equal(children.at(-1), last);
          main.empty(); assert.equal(node.firstChild, null); assert.equal(node.lastChild, null);
          if (!xml) {
            const template = $('template')[0], fragment = template.firstChild;
            assert.equal(fragment, template.lastChild);
            assert.equal(fragment.type, 'root');
            assert.equal(fragment.firstChild, fragment.lastChild);
            assert.equal(fragment.firstChild.name, 'b');
          }
          $.dispose();
          assert.throws(() => node.firstChild, { code: 'ERR_GROVEDOM_DISPOSED' });
          assert.throws(() => last.lastChild, { code: 'ERR_GROVEDOM_DISPOSED' });
        } finally { $.dispose(); }
      }
    },
  },
  {
    name: 'form collection preserves repeated forms and field order', corrected: true,
    run({ load }, execution) {
      for (const xml of [false, true]) {
        const $ = load('<form><input name="a" value="1"/><textarea name="b">two\nlines</textarea><input name="off" disabled="disabled"/></form><input name="c" value="3"/>', { xml, execution });
        try {
          const form = $('form')[0], field = $('input[name="c"]')[0];
          const values = $([form, field, form]).serializeArray();
          assert.deepEqual(structuredClone(values), [{ name: 'a', value: '1' }, { name: 'b', value: 'two\r\nlines' }, { name: 'c', value: '3' }, { name: 'a', value: '1' }, { name: 'b', value: 'two\r\nlines' }]);
          assert.equal($(field).serialize(), 'c=3');
        } finally { $.dispose(); }
      }
    },
  },
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
