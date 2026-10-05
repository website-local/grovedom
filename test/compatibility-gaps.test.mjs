import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

// Authored differential cases from css-select 5.2.2 attributeRules, parse5 7.3.0
// in-select modes and Cheerio 1.2.0 clone/val. No runtime reference dependency.
function compare(source, run, options = {}) {
  const $ = load(source, options);
  try { assert.deepEqual(run($), run(cheerio(source, options))); }
  finally { $.dispose(); }
}
const ids = s => s.map((_, node) => node.attribs.id).get();
const quote = value => JSON.stringify(value);

for (const xml of [false, true]) {
  test(`Unicode attribute comparisons preserve operator-specific JS rules (xml=${xml})`, () => {
    const pairs = [['É', 'é'], ['İ', 'i\u0307'], ['i\u0307', 'İ'], ['ΟΣ', 'ος'], ['ΟΣΑ', 'οσα'],
      ['Σ', 'ς'], ['ſ', 's'], ['K', 'k'], ['\u{10400}', '\u{10428}'], ['AΣ\u0301', 'aς\u0301'],
      ['\u{1c89}', '\u{1c8a}'], ['Éx', 'é'], ['xÉ', 'é'], ['É-x', 'é'], ['a É b', 'é']];
    for (const [value, operand] of pairs) compare('<p id="p"/>', $ => {
      $('p').attr('data-x', value);
      return ['=', '^=', '$=', '*=', '~=', '|='].flatMap(op => ['i', 's'].map(flag =>
        ids($(`p[data-x${op}${quote(operand)} ${flag}]`))));
    }, { xml });
  });
  test(`class and token selectors share JS whitespace with guards and nested plans (xml=${xml})`, () => {
    for (const space of ['\t', '\v', '\f', '\r', '\n', ' ', '\u00a0', '\u1680', '\u2003', '\u2028', '\u2029', '\u202f', '\u205f', '\u3000', '\ufeff']) {
      compare('<main><p id="p"></p><p id="q"></p><template><b></b></template></main>', $ => {
        $('#p').attr('class', `a${space}b`).attr('data-x', `x${space}É`);
        const result = ['.b', 'p.b', '[class~="b"]', '[data-x~="é" i]', 'main:has(.b)',
          ':is(.missing,.b)', '.b,.x,.y,.z,.q,.r,.s,.t'].map(s => ids($(s)));
        $('#q').attr('class', `c${space}b`);
        result.push(ids($('p.b')), ids($('#p').siblings('.b')));
        return result;
      }, { xml });
    }
  });
  test(`empty token operands follow css-select regex boundaries (xml=${xml})`, () => {
    for (const value of ['', ' ', 'x ', ' x', 'x y', 'x  y', 'x\u00a0y', 'x\u00a0\u2003y', '\u00a0x', 'é']) {
      compare('<p id="p"/>', $ => {
        $('p').attr('data-x', value);
        return ['[data-x~=""]', '[data-x~="" i]', ':not([data-x~=""])'].map(s => ids($(s)));
      }, { xml });
    }
  });
}

test('literal and escaped Unicode identifier spellings work', () => {
  // Literal NBSP is a useful WPT extension: css-what rejects that spelling.
  const $ = load('<p id="\u00a0"></p>');
  try { assert.equal($('#\u00a0').length, 1); } finally { $.dispose(); }
  for (const name of ['\u2003', 'é', '名', '\u{10400}']) compare('<p/>', $ => {
    $('p').attr('id', name).attr('class', name);
    return [$(`#${name}`).length, $(`#\\${name.codePointAt(0).toString(16)} `).length, $(`[id="${name}"]`).length];
  });
});

const selectInputs = ['<b>x</b><option value="a">A</option>', '<option>A<option>B<optgroup label="x"><option>C</optgroup>',
  '<option>A<hr><option>B', '<select><option>B</select><p>C</p>', '<option>A<input value="x"><option>B',
  '<option>A<textarea>x<b>y</b></textarea><p>Z</p>', '<optgroup><option>A</optgroup><option>B',
  '<script>x<b>y</b></script><template><b>T</b></template><option>A', 'a\0b<!--c--><div>d</div>',
  '<table><tr><td>x</td></tr></table><option>A'];
for (const execution of ['buffered', 'direct']) test(`select parsing and fragment replacement (${execution})`, () => {
  for (const source of selectInputs) {
    compare(`<select id="s">${source}</select><p>end</p>`, $ => $.html(), { execution });
    compare('<select id="s"><option>old</option></select>', $ => {
      const retained = $('#s').children();
      $('#s').html(source);
      return [$.html(), retained.text(), retained[0].parent === null];
    }, { execution });
    compare(`<table><tr><td><select>${source}</select></td></tr></table>`, $ => $.html(), { execution });
  }
});

test('XML select markup retains ordinary elements', () => {
  compare('<select><b>x</b></select>', $ => { $('select').html('<i>y</i>'); return $.html(); }, { xml: true });
});

test('clone collections share a hidden parent and retain identity during wrapping/movement', () => {
  compare('<main><i id="a">A</i><b id="b">B</b></main>', $ => {
    const original = $('main').children(), clone = original.clone();
    const result = [clone[0].parent.type, clone[0].parent === clone[1].parent, ids(clone.siblings()),
      clone[0] !== original[0], clone.parent().length];
    const retained = clone[0];
    clone.first().wrap('<container/>');
    result.push(clone.first().parent().html(), retained === clone[0], $('main').html());
    clone.appendTo('main');
    result.push($('main').html(), ids(clone.siblings()));
    return result;
  });
});

test('clone containers maintain reciprocal native sibling links through removals', () => {
  const $ = load('<main><i>A</i><b>B</b></main>');
  const clone = $('main').children().clone(), [a, b] = clone;
  try {
    assert.equal(a.next, b);
    assert.equal(b.prev, a);
    assert.deepEqual(clone.filter(':first-child').get(), [a]);
    assert.deepEqual(clone.filter(':last-child').get(), [b]);
    clone.first().remove();
    assert.equal(b.prev, null);
    assert.equal(a.parent, null);
    assert.equal($(b).text(), 'B');
  } finally { $.dispose(); }
  assert.throws(() => $(b).text(), { code: 'ERR_GROVEDOM_DISPOSED' });
});

for (const execution of ['buffered', 'direct']) test(`form arrays assign values without toggling checkboxes (${execution})`, () => {
  for (const value of [['a'], ['b', 'c'], ['implicit'], []]) compare('<input type="checkbox" value="a"><input type="radio" value="b" checked>' +
    '<select><option value="a" selected>A</option><option value="b">B</option></select>' +
    '<select multiple><option value="a">A</option><option value="b">B</option><option>implicit</option></select>', $ => {
    $('input').val(value);
    $('select').first().val(value);
    $('select[multiple]').val(value);
    return $.html();
  }, { execution });
});

test('html callbacks skip text/comments and preserve element callback order', () => {
  const $ = load('<main><i>A</i>text<b>B</b><!--c--></main>'), events = [];
  try {
    $('main').contents().html(function (i, old) { events.push([i, old, this.name]); return '<u>' + old + '</u>'; });
    assert.deepEqual(events, [[0, 'A', 'i'], [2, 'B', 'b']]);
    assert.equal($('main').html(), '<i><u>A</u></i>text<b><u>B</u></b><!--c-->');
  } finally { $.dispose(); }
});
