import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const source = '<main><section id="left"><div><p id="a"></p></div>' +
  '<p id="b" class="mark,one" data-list="a,b"></p></section>' +
  '<section id="right"><div><p id="c"></p></div><p id="d"></p></section></main>';
const ids = selected => selected.get().map(node => node.attribs.id ?? node.name);
function sameNodes(actual, expected) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++) assert.equal(actual[i], expected[i]);
}

for (const execution of ['buffered', 'direct']) for (const xml of [false, true]) {
  function parity(name, run) {
    test(`${name} (${execution}, xml=${xml})`, () => {
      const $ = load(source, { execution, xml }), reference = cheerio(source, { xml });
      try { assert.deepEqual(run($), run(reference)); } finally { $.dispose(); }
    });
  }

  parity('relative selector list permutations preserve scope, order and deduplication', $ => {
    const result = [];
    for (const context of [['#left'], ['#right', '#left'], ['#left', 'main'], ['main', '#left'],
      ['#right', '#right', '#left'], ['root'], ['root', '#left']]) {
      const roots = $(context.map(selector => selector === 'root' ? $.root()[0] : $(selector)[0]));
      for (const selector of ['> p, div p', 'div p, > p', '> p, div p, > p', 'div p, > p, div p',
        '> section, p', 'p, > section']) {
        const found = roots.find(selector);
        assert.equal(found.end(), roots);
        result.push(ids(found));
      }
    }
    return result;
  });

  parity('relative lists split only at unescaped top-level commas', $ => {
    const roots = $('#left');
    return ['> [data-list="a,b"], div p', 'div p, > [data-list="a,b"]',
      '> :is(p, aside), div p', 'div p, > :is(p, aside)',
      '> .mark\\,one, div p', 'div p, > .mark\\,one',
      '> .mark\\2c one, div p', 'div p, > .mark\\2c one',
      '> p/* , + aside */[data-list], div p', 'div p, /* , ~ aside */ > p[data-list]',
      ':scope > p, div p', 'div p, :scope > p'].map(selector => ids(roots.find(selector)));
  });

  parity('relative lists preserve escaped trailing spaces and adjacent comments', $ => {
    $('#b').attr('id', 'b ');
    const roots = $('#left');
    return ['> #b\\ , div p', 'div p, > #b\\ ', '> #b\\20 , div p',
      'div p, > #b\\000020', '> p/*comma,*/[data-list], div p',
      '/* > misleading, */ div p, /* + misleading, */ > p'].map(selector => ids(roots.find(selector)));
  });

  parity('relative lists observe queued mutations without changing retained membership', $ => {
    const roots = $('#left'), retained = roots.find('> p, div p'), handles = retained.get();
    roots.append('<p id="later"></p>');
    retained.first().attr('class', 'changed');
    const found = roots.find('div p.changed, > p');
    assert.equal(found[0], handles[0]);
    retained.first().remove();
    sameNodes(retained.get(), handles);
    return [ids(found), ids(retained), ids(roots.find('> p, div p.changed')), $.html()];
  });

  test(`relative list exclusions and malformed branches preserve later queries (${execution}, xml=${xml})`, () => {
    const $ = load(source, { execution, xml });
    try {
      const roots = $('#left');
      for (const selector of ['> p, + section', '+ section, > p', 'div p, + section, > p',
        '> p:first, div p', 'div p:first, > p', '> p, div p:first'])
        assert.throws(() => roots.find(selector), { code: 'ERR_GROVEDOM_UNSUPPORTED' }, selector);
      for (const selector of ['> p, div p', 'div p, > p', 'p, :scope']) {
        assert.throws(() => roots.filter(selector), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
        assert.throws(() => roots.is(selector), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
      }
      for (const selector of ['> p,', ', > p', '> p, , div p', 'div p, > [']) {
        assert.throws(() => roots.find(selector));
        assert.deepEqual(ids(roots.find('p[id]')), ['a', 'b']);
      }
      assert.deepEqual(ids(roots.find('p:contains(",:first"), > p')), ['b']);
    } finally { $.dispose(); }
  });
}

for (const execution of ['buffered', 'direct']) for (const xml of [false, true]) {
  test(`relative lists order wide and overlapping roots without stale ranks (${execution}, xml=${xml})`, () => {
    const markup = '<main>' + Array.from({ length: 90 }, (_, index) =>
      `<section id="s${index}"><p id="p${index}"></p><div><b id="b${index}"></b></div></section>`).join('') + '</main>';
    const $ = load(markup, { execution, xml }), reference = cheerio(markup, { xml });
    const run = api => {
      const sections = api('section').get(), reversed = [...sections].reverse();
      const contexts = [reversed, [...reversed, reversed[0]], [sections[89], api('main')[0], sections[0]],
        [sections[40], sections[0], sections[89]], [api.root()[0], sections[0]]];
      const result = [];
      for (const context of contexts) {
        const roots = api(context);
        for (const selector of ['> p, b', 'b, > p', '> section, p, b', 'b, p, > section'])
          result.push(ids(roots.find(selector)));
        result.push(ids(roots.find('p, b')), ids(api('section').find('b')));
      }
      return result;
    };
    try { assert.deepEqual(run($), run(reference)); } finally { $.dispose(); }
  });
}

for (const execution of ['buffered', 'direct']) test(`relative lists retain explicit template and document roots (${execution})`, () => {
  const markup = '<main><section id="outer"><template id="t"><div><section id="inner">' +
    '<b id="inside"></b><div><b id="nested"></b></div></section></div></template><b id="after"></b></section></main>';
  function run(open) {
    const $ = open(markup, { execution });
    try {
      const outer = $('#outer')[0], inner = $('#inner')[0], template = $('#t')[0];
      const result = [];
      for (const nodes of [[outer, inner], [inner, outer], [template, inner], [inner, template], [$.root()[0], inner]])
        for (const selector of ['> b, div b', 'div b, > b']) result.push(ids($(nodes).find(selector)));
      assert.equal(inner.parent.parent.parent, template);
      return result;
    } finally { $.dispose?.(); }
  }
  assert.deepEqual(run(load), run(cheerio));
});

for (const execution of ['buffered', 'direct']) test(`dense relative lists keep template and fragment ordering (${execution})`, () => {
  const block = prefix => Array.from({ length: 40 }, (_, index) =>
    `<p id="${prefix}p${index}"></p><div><b id="${prefix}b${index}"></b></div>`).join('');
  const markup = '<main><section id="outer">' + block('o') + '<template id="t"><div id="inner">' +
    block('i') + '</div></template></section><section id="right">' + block('r') + '</section></main>';
  const $ = load(markup, { execution }), reference = cheerio(markup);
  const run = api => {
    const outer = api('#outer')[0], inner = api('#inner')[0], right = api('#right')[0], template = api('#t')[0];
    const result = [];
    for (const contexts of [[right, outer], [inner, outer, inner], [outer, inner], [inner, template],
      [template, inner], [template, inner.parent], [inner.parent, right], [api.root()[0], inner]]) {
      const roots = api(contexts);
      for (const selector of ['> p, b', 'b, > p', '> div, p', 'p, > div']) result.push(ids(roots.find(selector)));
      result.push(ids(roots.find('p, b')));
    }
    assert.equal(inner.parent.parent, template);
    return result;
  };
  try { assert.deepEqual(run($), run(reference)); } finally { $.dispose(); }
});

test('long flat relative lists do not grow the JavaScript call stack', () => {
  const $ = load('<main><p id="a"></p><div><p id="b"></p></div></main>');
  try {
    const selector = Array.from({ length: 3000 }, (_, index) => index % 2 ? '> p' : 'div p').join(',');
    assert.deepEqual(ids($('main').find(selector)), ['a', 'b']);
  } finally { $.dispose(); }
});

for (const xml of [false, true]) test(`dense relative lists traverse deep trees iteratively (xml=${xml})`, () => {
  const $ = load('<main>' + '<div>'.repeat(1200) + '<p></p>' + '</div>'.repeat(1200) + '</main>', { xml });
  try {
    const main = $('main'), expected = main.find('div').get();
    assert.equal(expected.length, 1200);
    sameNodes(main.find('> div, div').get(), expected);
    sameNodes(main.find('div, > div').get(), expected);
    // A context outside find's descendants must retain the entire original union.
    sameNodes(main.find(':scope, div').get(), [main[0], ...expected]);
    sameNodes(main.find('div').get(), expected);
  } finally { $.dispose(); }
});

for (const xml of [false, true]) for (const execution of ['buffered', 'direct']) {
  test(`relative lists preserve explicitly attached fragment contexts (xml=${xml}, ${execution})`, () => {
    const $ = load('<main><section id="left"><p id="l"></p></section><section id="right"><p id="r"></p></section></main>', { xml, execution });
    try {
      const left = $('#left'), right = $('#right'), inner = $('<div><p id="i"></p></div>');
      const fragment = inner[0].parent;
      right.prepend(fragment);
      const roots = $([right[0], left[0], inner[0]]);
      for (const selector of ['> p, p', 'p, > p', '> p, > a']) {
        assert.deepEqual(ids(roots.find(selector)), ['l', 'i', 'r']);
        assert.deepEqual(ids($([fragment, left[0]]).find(selector)), selector === '> p, > a' ? ['l'] : ['i', 'l']);
        assert.deepEqual(ids($([left[0], fragment]).find(selector)), selector === '> p, > a' ? ['l'] : ['l', 'i']);
      }
      assert.equal(inner[0].parent, fragment);
      assert.equal(fragment.parent, right[0]);
      // Ordinary find also keeps the explicit inner context across the raw
      // fragment, while retaining caller order (unlike the relative union).
      assert.deepEqual(ids(roots.find('p')), ['r', 'l', 'i']);
    } finally { $.dispose(); }
  });
}
