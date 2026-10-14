import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const markup = '<main><p id="a">one</p><p id="b">two</p><p id="c">three</p></main>';
const ids = selection => selection.get().map(node => node.attribs.id);

for (const xml of [false, true]) for (const execution of ['buffered', 'direct']) {
  function parity(name, run, source = markup) {
    test(`${name}, xml=${xml}, ${execution}`, () => {
      const $ = load(source, { xml, execution }), reference = cheerio(source, { xml });
      try { assert.deepEqual(run($), run(reference)); }
      finally { $.dispose(); }
    });
  }

  parity('not callbacks select duplicate occurrences independently and keep their previous context', $ => {
    const all = $('p'), selected = $([all[0], all[0], all[1], all[0]]), seen = [];
    const result = selected.not(function (index, node) {
      seen.push([index, node.attribs.id, this === node]);
      return index === 0 || index === 3;
    });
    assert.equal(result.end(), selected);
    assert.equal(result[0], all[0]);
    assert.equal(result[1], all[1]);
    assert.deepEqual(ids(selected), ['a', 'a', 'b', 'a']);
    return [seen, ids(result)];
  });

  parity('not callbacks retain occurrence indices through queries, removals and exceptions', $ => {
    const all = $('p'), selected = $([all[0], all[1], all[0], all[2]]), seen = [];
    const result = selected.not(function (index, node) {
      seen.push([index, node.attribs.id, $('p').length]);
      if (!index) $(node).remove();
      return index === 2;
    });
    const error = new Error('stop callback');
    assert.throws(() => selected.not(function (index) {
      $(this).attr('data-visited', String(index));
      if (index === 1) throw error;
      return false;
    }), caught => caught === error);
    return [seen, ids(result), selected.get().map(node => ({ ...node.attribs })), $.html()];
  });

  parity('extraction captures descriptor getters once before querying', $ => {
    const seen = [];
    const result = $.extract({ values: [{
      get selector() { seen.push('selector'); return 'p'; },
      get value() {
        seen.push('value');
        $('p').first().remove();
        return node => { seen.push(node.attribs.id); return node.attribs.id; };
      },
    }] });
    assert.deepEqual(seen, ['selector', 'value', 'b', 'c']);
    return [seen, result, $.html()];
  });

  parity('extraction evaluates value getters for empty results and propagates getter errors', $ => {
    const seen = [];
    const result = $.extract({
      single: { selector: 'missing', get value() { seen.push('single'); return 'textContent'; } },
      many: [{ selector: 'missing', get value() { seen.push('many'); return 'textContent'; } }],
    });
    const error = new Error('descriptor getter');
    assert.throws(() => $.extract({ missing: {
      selector: 'missing', get value() { $('p').first().attr('title', 'kept'); throw error; },
    } }), caught => caught === error);
    return [seen, result, $.html()];
  });

  parity('extraction keeps the chosen callback when a descriptor changes during iteration', $ => {
    const descriptor = { selector: 'p', value: node => {
      descriptor.value = 'textContent';
      return node.attribs.id;
    } };
    const first = $.extract({ values: [descriptor] });
    const second = $.extract({ values: [descriptor] });
    assert.deepEqual(first.values, ['a', 'b', 'c']);
    assert.deepEqual(second.values, ['one', 'two', 'three']);
    return [first, second];
  });

  parity('extraction flattens sparse callback arrays once and retains empty entries', $ => $.extract({
    values: [{ selector: 'p', value: node => [, node.attribs.id, [null, undefined], ,] }],
    scalarNull: { selector: 'p', value: () => null },
    arrayNull: [{ selector: 'p', value: () => null }],
  }));

  parity('form type matching preserves HTML and XML case rules', $ => [
    $('form').serializeArray(), $('form').serialize(),
  ], '<form><input name="upperCheck" type="CHECKBOX" value="upper"/>' +
    '<input name="lowerCheck" type="checkbox" value="lower"/>' +
    '<input name="mixedRadio" type="Radio" checked="checked" value="mixed"/>' +
    '<input name="upperFile" type="FILE" value="upper-file"/>' +
    '<input name="lowerFile" type="file" value="lower-file"/>' +
    '<input name="upperSubmit" type="SUBMIT" value="upper-submit"/>' +
    '<input name="ordinary" value="a b"/></form>');
}
