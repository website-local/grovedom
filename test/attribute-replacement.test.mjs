import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const source = '<main>text<p data-\u00a0="a" data-a\u2003b="b">one</p><!--gap-->' +
  '<p data-\ufeff="c" data-\u2028="d">two</p></main>';
const values = selection => selection.get().map(node => ({ ...node.attribs }));

for (const execution of ['buffered', 'direct']) for (const xml of [false, true]) {
  function parity(name, run) {
    test(`${name} (${execution}, xml=${xml})`, () => {
      const $ = load(source, { execution, xml }), reference = cheerio(source, { xml });
      try { assert.deepEqual(run($), run(reference)); } finally { $.dispose(); }
    });
  }

  parity('attribute replacement clears exact Unicode names and preserves snapshots', $ => {
    const selected = $('p'), handles = selected.get();
    selected.attr('queued-\u00a0', 'pending');
    const before = selected.get().map(node => ({ ...$(node).attr() }));
    assert.equal(selected.prop('attribs', { title: 'new', 'data-\u00a0': 'replacement' }), selected);
    assert.deepEqual(selected.get(), handles);
    const replaced = values(selected);
    selected.prop('attribs', {});
    return [before, replaced, values(selected), $.html()];
  });

  parity('attribute replacement callbacks retain order and earlier effects after a throw', $ => {
    const selected = $('p'), handles = selected.get(), events = [], sentinel = new Error('stop replacement');
    assert.throws(() => $('main').contents().prop('attribs', function (index, old) {
      events.push([index, this === handles[events.length], { ...old }, values(selected)]);
      $(this).attr('side-\u00a0', 'kept');
      if (events.length === 2) throw sentinel;
      return { title: 'replaced' };
    }), error => error === sentinel);
    assert.deepEqual(selected.get(), handles);
    return [events, values(selected), $.html()];
  });

  parity('removeAttr keeps its whitespace-list semantics independently of replacement', $ => {
    const selected = $('p').first();
    selected.attr({ 'data-': 'short', a: 'A', b: 'B' });
    selected.removeAttr('a\u00a0b data-\u00a0');
    const removed = values(selected);
    selected.prop('attribs', { title: 'only' });
    return [removed, values(selected)];
  });

  parity('attribute replacement can retain its own live view and callback edits', $ => {
    const selected = $('p'), handles = selected.get(), first = selected.first();
    first.prop('attribs', handles[0].attribs);
    const self = values(first);
    first.prop('attribs', first.prop('attribs'));
    const events = [];
    selected.prop('attribs', function (index, old) {
      events.push([index, { ...old }]);
      $(this).attr('callback-\u00a0', String(index));
      return old;
    });
    assert.deepEqual(selected.get(), handles);
    return [self, events, values(selected)];
  });

  test(`attribute replacement copies values without sharing storage (${execution}, xml=${xml})`, () => {
    const $ = load(source, { execution, xml });
    try {
      const selected = $('p'), first = selected.first(), last = selected.last();
      selected.prop('attribs', first.prop('attribs'));
      const copied = { ...last[0].attribs };
      first.attr('only-first', 'yes');
      assert.deepEqual({ ...last[0].attribs }, copied);
      const replacement = { title: 'new' };
      selected.prop('attribs', replacement);
      replacement.title = 'external';
      assert.deepEqual(values(selected), [{ title: 'new' }, { title: 'new' }]);
    } finally { $.dispose(); }
  });
}
