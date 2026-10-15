import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const source = '<main><section id="left"><div><p id="a"></p></div>' +
  '<p id="b" class="mark,one" data-list="a,b"></p></section>' +
  '<section id="right"><div><p id="c"></p></div><p id="d"></p></section></main>';
const ids = selected => selected.get().map(node => node.attribs.id ?? node.name);

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
      for (const selector of ['> p, div p', 'div p, > p', '> p, div p, > p', 'div p, > p, div p']) {
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
    assert.deepEqual(retained.get(), handles);
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

test('long flat relative lists do not grow the JavaScript call stack', () => {
  const $ = load('<main><p id="a"></p><div><p id="b"></p></div></main>');
  try {
    const selector = Array.from({ length: 3000 }, (_, index) => index % 2 ? '> p' : 'div p').join(',');
    assert.deepEqual(ids($('main').find(selector)), ['a', 'b']);
  } finally { $.dispose(); }
});
