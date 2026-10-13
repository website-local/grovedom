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
      const replacement = $('<i>new</i>'), text = roots.contents()[0];
      selected.replaceWith(replacement);
      assert.equal(roots.children().length, 1);
      assert.equal(roots.children()[0], replacement[0]);
      assert.equal(replacement[0].prev, text);
      assert.equal(text.next, replacement[0]);
      assert.equal(replacement.prop('previousSibling'), text);
      assert.equal(replacement.prop('firstChild'), replacement[0].firstChild);
      assert.throws(() => replacement.prop('parent', null), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
    } finally { $.dispose(); }
  }
  console.log('Portable release contracts passed in HTML/XML and buffered/direct modes.');
}
