import assert from 'node:assert/strict';

// The same corrections must reach installed packages and the portable facade.
export const reviewCases = [
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
