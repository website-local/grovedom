import assert from 'node:assert/strict';

export function checkBrowserRelease(api) {
  // Exercise the release corrections through the actual portable facade, including
  // its encodeInto/finalizer fallbacks. JSON comparisons cross the VM realm boundary.
  for (const execution of ['buffered', 'direct']) for (const xml of [false, true]) {
    const $ = api.load('<main>text<p id="item:first" title="a">A</p><p title="b">B</p></main>', { xml, execution }, false);
    try {
      const roots = $('main'), selected = $('p'), events = [];
      assert.equal(roots.find(selected).end(), roots);
      assert.equal($('#item\\:first:first')[0], selected[0]);
      assert.throws(() => $('main, p:first'), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
      roots.contents().prop('title', function (i, old) { events.push([i, old]); return undefined; });
      assert.deepEqual(events, [[1, 'a'], [2, 'b']]);
      assert.equal(selected.last().attr('title'), 'undefined');
      events.length = 0;
      selected.css({ color(i) { events.push(i); return 'red'; }, display(i) { events.push(i); return 'block'; } });
      assert.deepEqual(events, [0, 1, 0, 1]);
      assert.equal(selected.last().attr('style'), 'color: red; display: block;');
      const extracted = $.extract({ values: [{ selector: 'p', value: node => [$(node).text(), [1], null] }] });
      assert.equal(JSON.stringify(extracted), JSON.stringify({ values: ['A', [1], null, 'B', [1], null] }));
      const repeated = $([selected[0], selected[0], selected[1]]);
      const filtered = repeated.not(index => index === 0);
      assert.equal(filtered.length, 2);
      assert.equal(filtered[0], selected[0]);
      assert.equal(filtered[1], selected[1]);
      assert.equal(filtered.end(), repeated);
      let reads = 0;
      const values = $.extract({ items: [{
        selector: 'p', get value() { reads++; return node => $(node).text(); },
      }] });
      assert.equal(JSON.stringify(values), JSON.stringify({ items: ['A', 'B'] }));
      assert.equal(reads, 1);
      $.extract({ missing: { selector: 'missing', get value() { reads++; return 'textContent'; } } });
      assert.equal(reads, 2);
      const replacement = $('<i>new</i>'), text = roots.contents()[0];
      selected.replaceWith(replacement);
      assert.equal(roots.children().length, 1);
      assert.equal(roots.children()[0], replacement[0]);
      assert.equal(replacement[0].prev, text);
      assert.equal(text.next, replacement[0]);
      assert.equal(replacement.prop('previousSibling'), text);
      assert.equal(replacement.prop('firstChild'), replacement[0].firstChild);
      assert.throws(() => replacement.prop('parent', null), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
      const form = $('<form><input name="upper" type="FILE" value="kept"/>' +
        '<input name="lower" type="file" value="omitted"/></form>');
      assert.equal(JSON.stringify(form.serializeArray()), JSON.stringify(xml ? [{ name: 'upper', value: 'kept' }] : []));
      if (!xml) {
        roots.append('<section id="outer"><template id="t"><div><section id="inner">' +
          '<b id="inside"></b></section></div></template><b id="after"></b></section>');
        const outer = $('#outer')[0], inner = $('#inner')[0];
        assert.equal(JSON.stringify($([outer, inner]).find('b').get().map(node => node.attribs.id)),
          JSON.stringify(['inside', 'after']));
        assert.equal(inner.parent.parent.parent, $('#t')[0]);
      }
    } finally { $.dispose(); }
  }
  console.log('Portable release contracts passed in HTML/XML and buffered/direct modes.');
}
