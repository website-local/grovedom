import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const source = '<main><i id="a">A</i>gap<i id="b">B</i><!-- gap --><i id="c">C</i></main>';
const names = ($, nodes) => nodes.map((_, node) => $(node).attr('id')).get();
function compare(markup, run, options) {
  const $ = load(markup, options), reference = cheerio(markup, options);
  try { assert.deepEqual(run($), run(reference)); }
  finally { $.dispose(); }
}

test('node membership filters preserve occurrences, order, history and copied arrays', () => {
  compare(source, $ => {
    const all = $('i'), nodes = all.toArray(), repeated = $([nodes[2], nodes[0], nodes[2]]);
    const kept = repeated.filter(nodes[2]), excluded = repeated.not(nodes[2]);
    const found = $('main').find(all);
    const before = [names($, kept), names($, excluded), names($, found),
      kept.end() === repeated, repeated.is(nodes[0]), repeated.is([]), all.not([]).length];
    const removed = all.splice(1, 1, nodes[0]);
    all[0] = nodes[2];
    return [...before, removed[0] === nodes[1], nodes[0].attribs.id, names($, all), names($, kept)];
  });
});

test('index handles element siblings, text, detached nodes and duplicate membership', () => {
  compare(source, $ => {
    const all = $('i'), b = all.get(1), text = $('main').contents().get(1);
    const duplicate = $([b, all.get(0), b]);
    const result = [all.eq(1).index(), $(text).index(), all.eq(2).index('i'),
      duplicate.index(b), duplicate.index(all.first()), all.index($('<u/>')),
      $('missing').index(b), $('main').index()];
    all.eq(1).remove();
    result.push($(b).index(), all.index(b));
    return result;
  });
});

test('membership checks validate foreign owners while index compares identity', () => {
  const $ = load(source), other = load('<i>other</i>');
  try {
    const foreign = other('i').get(0);
    assert.throws(() => $('i').is(foreign), /another document/);
    other.dispose();
    assert.equal($('i').index(foreign), -1);
    const retained = $('i');
    $.dispose();
    for (const operation of [() => retained.toArray(), () => retained.is([]), () => retained.not()])
      assert.throws(operation, error => error.code === 'ERR_GROVEDOM_DISPOSED');
  } finally { $.dispose(); other.dispose(); }
});

test('mapped values flatten once and node maps retain selection identity', () => {
  compare(source, $ => {
    const all = $('i');
    const nodes = all.map((i, node) => i === 1 ? null : [node, node]);
    const values = all.map((i, node) => i === 1 ? undefined : [$(node).text(), i]);
    return [names($, nodes), nodes.end() === all, values.get(), values.end() === all,
      all.map(() => null).length];
  });
});

test('CSS serialization retains own special keys and property order', () => {
  const $ = load('<i style="__proto__: literal; constructor: own; width: 1px;"></i>');
  try {
    const node = $('i');
    node.css('height', (i, old) => old === undefined && i === 0 ? '2px' : 'bad');
    assert.equal(node.attr('style'), '__proto__: literal; constructor: own; width: 1px; height: 2px;');
    const style = node.css(['__proto__', 'constructor', 'missing', 'width', 'width']);
    assert.equal(Object.getPrototypeOf(style) === Object.prototype, true);
    assert.deepEqual(Object.keys(style), ['__proto__', 'constructor', 'width']);
    assert.equal(Object.getOwnPropertyDescriptor(style, '__proto__').value, 'literal');
  } finally { $.dispose(); }
});

test('CSS key arrays finish their snapshot before inherited values are read', () => {
  const key = 'grovedom-array-style-probe';
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
  const $ = load('<i style="width: 1px; height: 2px;"></i>');
  try {
    Object.defineProperty(Object.prototype, key, { value: 'before', writable: true, configurable: true });
    const requested = [key, , 'width'];
    Object.defineProperty(requested, 1, { get() {
      Object.prototype[key] = 'after';
      delete requested[2];
      requested.push('width');
      return 'height';
    } });
    const values = $('i').css(requested);
    assert.deepEqual(Object.keys(values), [key, 'height']);
    assert.equal(values[key], 'after');
    assert.equal(values.height, '2px');
  } finally {
    if (previous) Object.defineProperty(Object.prototype, key, previous);
    else delete Object.prototype[key];
    $.dispose();
  }
});

test('CSS declarations retain malformed tails, duplicate names and delimiter boundaries', () => {
  for (const style of [
    'x:a;;;;;:tail; no-colon; color:blue;',
    'a:old; a:new; tail   ;;;;',
    'color:;position:absolute;',
    'one \t:\n 0;\n two \f\r:\v 1',
    'background-image:url(data:image/png;base64,abc);',
    'tail;'.repeat(64) + 'color:blue;',
    'color:blue;' + 'tail;'.repeat(64),
  ]) compare('<i></i>', $ => {
    const node = $('i').attr('style', style);
    const before = node.css();
    node.css('height', '2px');
    return [before, node.css(), node.attr('style')];
  });
});

test('closest retains unique results, input order and root boundaries', () => {
  compare('<main><section id="a"><b></b><i></i></section><section id="b"><i></i></section></main>', $ => {
    const all = $('i,b'), a = $('#a'), b = $('#b');
    return [names($, all.closest('section')), names($, all.closest('main', a.get(0))),
      names($, $([all.get(2), all.get(0), all.get(1)]).closest('section')),
      a.closest(b).length, $.root().closest('*').length];
  });
});

test('class strings and callbacks retain whitespace, duplicate and visit semantics', () => {
  compare('<i class="a a b"></i><i class="c"></i>', $ => {
    const seen = [];
    $('i').removeClass('a a').addClass('d e f').toggleClass('d e d');
    $('i').addClass(function (i, old) { seen.push([i, old]); return i ? 'x y' : ' z '; });
    return [seen, $('i').map((_, node) => $(node).attr('class')).get()];
  });
});

test('nested class array accessors keep length snapshots and run for every node', () => {
  const $ = load('<i></i><i></i>');
  try {
    let visits = 0;
    const tokens = ['a'];
    Object.defineProperty(tokens, 0, { get() { visits++; return ['a b', ['c']]; } });
    $('i').addClass(tokens);
    assert.equal(visits, 2);
    assert.deepEqual($('i').map((_, node) => $(node).attr('class')).get(), ['a b c', 'a b c']);
  } finally { $.dispose(); }
});

for (const method of ['prepend', 'after']) test(`${method} preserves nested input getter order without modifying caller arrays`, () => {
  const $ = load('<main><u>C</u></main>');
  try {
    const seen = [], values = [];
    Object.defineProperty(values, 0, { enumerable: true, get() { seen.push(0); return '<i>A</i>'; } });
    Object.defineProperty(values, 1, { enumerable: true, get() { seen.push(1); return '<b>B</b>'; } });
    const target = method === 'prepend' ? $('main') : $('u');
    target[method](values);
    assert.deepEqual(seen, [0, 0, 0, 1]);
    assert.equal($('main').html(), method === 'prepend' ? '<i>A</i><b>B</b><u>C</u>' : '<u>C</u><i>A</i><b>B</b>');
    assert.equal(Object.getOwnPropertyDescriptor(values, 0).get instanceof Function, true);
  } finally { $.dispose(); }
});

test('reverse insertion keeps custom array iterators and selection snapshots', () => {
  const $ = load('<main><u>C</u></main>');
  try {
    const values = ['unused'];
    values[Symbol.iterator] = function* () { yield '<i>A</i>'; yield '<b>B</b>'; };
    const retained = $('main').children();
    $('main').prepend(values);
    assert.equal($('main').html(), '<i>A</i><b>B</b><u>C</u>');
    assert.equal(retained.length, 1);
    assert.equal(retained.get(0).name, 'u');
  } finally { $.dispose(); }
});

test('select value coercion snapshots input length and observes later changed entries', () => {
  const $ = load('<select multiple><option value="a">a</option><option value="b">b</option><option value="c">c</option></select>');
  try {
    // GroveDOM snapshots the array length before coercion. Cheerio's live
    // iteration differs when toString appends another value to the input.
    const values = [{ toString() { values[1] = 'b'; values.push('c'); return 'a'; } }, 'unused'];
    $('select').val(values);
    assert.deepEqual($('select').val(), ['a', 'b']);
    assert.deepEqual($('option:selected').map((_, node) => $(node).text()).get(), ['a', 'b']);
  } finally { $.dispose(); }
});

test('sparse select value arrays preserve undefined membership', () => {
  const $ = load('<select multiple><option>implicit</option><option value="a">a</option><option value="b">b</option></select>');
  try {
    $('select').val([, 'b']);
    assert.deepEqual($('option').map((_, node) => $(node).attr('selected') !== undefined).get(), [true, false, true]);
  } finally { $.dispose(); }
});

test('form serialization preserves duplicate fields, values, newlines and encoding', () => {
  compare('<form><input name="a b" value="x y"><input name="a b" value="z"><textarea name="t">line\n雪</textarea><select name="s" multiple><option selected>a</option><option selected>b</option></select><input name="skip" disabled></form>', $ => {
    const form = $('form');
    return [form.serializeArray(), form.serialize(), $('input').first().val()];
  });
});

for (const execution of ['buffered', 'direct']) test(`${execution}: positional ranges retain order and source snapshots`, () => {
  compare(source, $ => {
    const all = $('i'), outputs = [];
    for (const selector of [':even', ':odd', ':gt(-99):even', ':lt(0)', ':gt(0):lt(1)',
      ':lt(3)', ':gt(3)', ':gt(-2)', ':lt(2)'])
      outputs.push(names($, all.filter(selector)));
    outputs.push(names($, all), all.filter(':odd').end() === all);
    return outputs;
  }, { execution });
});

test('positional operands outside uint32 keep their numeric range', () => {
  const $ = load(source);
  try {
    const all = $('i');
    assert.equal(all.filter(':lt(4294967296)').length, 3);
    assert.equal(all.filter(':gt(4294967296)').length, 0);
    assert.equal(all.filter(':gt(-4294967296)').length, 3);
    // This bound is intentionally not truncated to uint32. Cheerio differs.
    assert.equal(all.filter(':lt(-4294967296)').length, 0);
  } finally { $.dispose(); }
});

test('data enumeration preserves own special keys without copying inherited attributes', () => {
  const $ = load('<i data-first-name="Ada" data-count="2" data-__proto__="true"></i>');
  try {
    const values = $('i').data();
    assert.equal(Object.getPrototypeOf(values) === Object.prototype, true);
    assert.equal(Object.getOwnPropertyDescriptor(values, '__proto__').value, true);
    assert.equal(values.firstName, 'Ada');
    assert.equal(values.count, 2);
  } finally { $.dispose(); }
});
