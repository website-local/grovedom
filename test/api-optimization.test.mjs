import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const source = '<main><section id="left"><p id="a" class="keep">A</p>text<!--gap-->' +
  '<p id="b"><b>B</b></p><p id="c" class="keep stop">C</p><p id="d">D</p></section>' +
  '<section id="right"><p id="e" class="keep">E</p><p id="f">F</p></section></main>';
const identify = nodes => nodes.map(node => node.attribs?.id ?? node.name ?? node.type);

for (const xml of [false, true]) for (const execution of ['buffered', 'direct']) {
  const mode = `xml=${xml}, ${execution}`;
  test(`until selectors preserve singleton matching and occurrence filters (${mode})`, () => {
    const run = factory => {
      const $ = factory(source, { xml, execution }), records = [];
      try {
        const all = $('p').get();
        for (const roots of [[all[0]], [all[1], all[0], all[1], all[4]], [...all].reverse()]) {
          const selected = $(roots);
          for (const method of ['nextUntil', 'prevUntil', 'parentsUntil']) {
            for (const stop of [undefined, '', '#c', '.stop', 'p', 'missing', 'p:first', ':eq(1)',
              ':nth-child(2n)', ':has(b)', ':not(.keep)', ':contains(C)', 'p, section',
              '[id="c"]', '/* before */ .stop', all[2], $([all[2], all[5]])]) {
              for (const filter of [undefined, '.keep', ':eq(2)']) {
                const result = selected[method](stop, filter);
                records.push([identify(result.get()), result.end() === selected]);
              }
              const visits = [];
              const result = selected[method](stop, function (index, node) {
                visits.push([index, node === this, this.attribs.id ?? this.name]);
                return index % 3 !== 1;
              });
              records.push([identify(result.get()), visits, result.end() === selected]);
            }
          }
        }
        records.push(identify($('#d').nextUntil('invalid[').get()));
        return records;
      } finally { $.dispose?.(); }
    };
    assert.deepEqual(run(load), run(cheerio));
  });

  test(`until callbacks observe live relations and retain result snapshots (${mode})`, () => {
    const run = factory => {
      const $ = factory(source, { xml, execution });
      try {
        const a = $('#a')[0], events = [], selected = $([a, a]);
        const result = selected.nextUntil(function (i, node) {
          events.push([i, this === node, this.attribs.id]);
          if (!i) { $('#c').remove(); $('#left').append('<p id="later">later</p>'); }
          return this.attribs.id === 'd';
        });
        const retained = result.get();
        $('#left').empty();
        return [events, identify(retained), result.get().every((node, i) => node === retained[i])];
      } finally { $.dispose?.(); }
    };
    assert.deepEqual(run(load), run(cheerio));
  });

  test(`until callbacks follow removal, insertion, replacement and reparenting (${mode})`, () => {
    for (const action of ['remove', 'insert', 'replace', 'move', 'empty']) {
      const run = factory => {
        const $ = factory(source, { xml, execution }), events = [];
        try {
          let changed = false;
          const result = $('#a').nextUntil(function (i) {
            events.push([i, this.attribs.id]);
            if (!changed) {
              changed = true;
              if (action === 'remove') $(this).remove();
              else if (action === 'insert') $(this).after('<p id="new">new</p>');
              else if (action === 'replace') $(this).replaceWith('<p id="replacement">new</p>');
              else if (action === 'move') $('#right').prepend(this);
              else $('#left').text('empty');
            }
            return this.attribs.id === 'd';
          });
          return [events, identify(result.get()), $.html()];
        } finally { $.dispose?.(); }
      };
      assert.deepEqual(run(load), run(cheerio), action);
    }
  });

  test(`until callbacks follow changed previous-sibling and parent links (${mode})`, () => {
    for (const method of ['prevUntil', 'parentsUntil']) for (const action of ['remove', 'insert', 'replace', 'move']) {
      const run = factory => {
        const $ = factory(source, { xml, execution }), events = [];
        try {
          let changed = false;
          const start = method === 'prevUntil' ? '#d' : '#b b';
          const result = $(start)[method](function (i, node) {
            events.push([i, this === node, this.attribs.id ?? this.name]);
            if (!changed) {
              changed = true;
              if (action === 'remove') $(this).remove();
              else if (action === 'insert') {
                if (method === 'prevUntil') $(this).before('<p id="new">new</p>');
                else $(this).wrap('<article id="new"></article>');
              } else if (action === 'replace') $(this).replaceWith('<p id="replacement">new</p>');
              else $('#right').append(this);
            }
            return false;
          });
          return [events, identify(result.get()), $.html()];
        } finally { $.dispose?.(); }
      };
      assert.deepEqual(run(load), run(cheerio), `${method}, ${action}`);
    }
  });

  test(`bulk until transfers wide root and stop selections (${mode})`, () => {
    const $ = load('<main>' + '<i></i>'.repeat(5000) + '</main>', { xml, execution });
    try {
      const roots = $('i'), last = roots.last()[0];
      const result = roots.nextUntil('.missing');
      assert.equal(result.length, 4999);
      assert.equal(result.last()[0], last);
      assert.equal(result.end(), roots);
      assert.equal(roots.nextUntil(roots).length, 0);
      assert.equal(roots.prevUntil(roots).length, 0);
      roots.remove();
      assert.equal(result.last()[0], last);
    } finally { $.dispose(); }
  });

  test(`live attribute enumeration observes writes between property visits (${mode})`, () => {
    const run = factory => {
      const $ = factory('<i a="one" b="two" c="three"></i><b id="other"></b>', { xml, execution });
      try {
        const element = $('i'), view = element[0].attribs, records = [];
        records.push(Object.entries(view));
        const target = { set a(value) {
          records.push(value);
          element.attr('b', 'changed').removeAttr('c').attr('d', 'new');
        } };
        Object.assign(target, view);
        records.push(Object.entries(target), Object.entries(view));
        element.prop('tagName', 'span');
        element.attr('a', 'renamed');
        records.push(view.a, Object.getOwnPropertyDescriptor(view, 'b').value, 'c' in view);
        const copy = { ...element.attr() }; copy.b = 'external';
        records.push(view.b, Object.entries($('b')[0].attribs), view.a);
        view.b = 'raw'; delete view.a;
        records.push(Object.entries(view));
        element.attr('x', function () { element.attr('b', 'callback'); return 'x'; });
        records.push(view.b, view.x);
        element.prop('attribs', { z: 'replacement' });
        records.push(Object.entries(element[0].attribs));
        return records;
      } finally { $.dispose?.(); }
    };
    assert.deepEqual(run(load), run(cheerio));
  });

  test(`live attribute snapshots handle prototype names, failure and disposal (${mode})`, () => {
    const $ = load('<i a="before"></i>', { xml, execution });
    const view = $('i')[0].attribs;
    try {
      Object.keys(view);
      assert.equal(view.toString, undefined);
      assert.equal(view.__proto__, undefined);
      for (const name of ['__proto__', 'constructor', 'toString']) view[name] = 'own';
      assert.deepEqual(Object.entries(view), [['a', 'before'], ['__proto__', 'own'], ['constructor', 'own'], ['toString', 'own']]);
      assert.throws(() => $('i').attr('a', () => { view.a = 'after'; throw new Error('callback'); }), /callback/);
      assert.equal(view.a, 'after');
      Object.keys(view);
      $.dispose();
      assert.throws(() => view.a, { code: 'ERR_GROVEDOM_DISPOSED' });
      assert.throws(() => Object.getOwnPropertyDescriptor(view, 'a'), { code: 'ERR_GROVEDOM_DISPOSED' });
      assert.throws(() => 'a' in view, { code: 'ERR_GROVEDOM_DISPOSED' });
    } finally { $.dispose(); }
  });

  test(`contains observes movement, detached ancestry and independent owners (${mode})`, () => {
    const run = factory => {
      const $ = factory(source, { xml, execution }), other = factory('<p></p>', { xml, execution });
      try {
        const left = $('#left')[0], right = $('#right')[0], a = $('#a')[0], records = [];
        const observe = () => records.push($.contains(left, a), $.contains(right, a), $.contains(a, a));
        observe(); $(right).append(a); observe();
        $(right).remove(); observe();
        $(a).remove(); observe();
        records.push($.contains(left, other('p')[0]));
        return records;
      } finally { $.dispose?.(); other.dispose?.(); }
    };
    assert.deepEqual(run(load), run(cheerio));
  });

  test(`scalar callbacks preserve nested coercions and retained selections (${mode})`, () => {
    const run = factory => {
      const $ = factory('<main><p id="a">a</p><p id="b">b</p></main>', { xml, execution }), saved = [];
      try {
        $('p').attr('data-value', function (i, old) {
          saved.push($(this));
          return { toString() { $('#b').attr('data-inner', () => 'nested'); return `${i}:${old}`; } };
        });
        $('p').text(function (i, old) {
          saved.push($(this));
          return { toString() { $('#a').text(() => 'reentrant'); return `${i}:${old}`; } };
        });
        const handles = saved.map(value => value[0]);
        return [$.html(), identify(handles), handles[0] === handles[2], handles[1] === handles[3]];
      } finally { $.dispose?.(); }
    };
    assert.deepEqual(run(load), run(cheerio));
  });
}

for (const xml of [false, true]) for (const template of xml ? [false] : [false, true]) {
  test(`bulk until stop matching respects raw fragment boundaries, xml=${xml}, template=${template}`, () => {
    const $ = load('<main></main>' + (template ? '<template><p>other</p></template>' : ''), { xml });
    try {
      const content = $('<section><p id="a">A</p><p id="b" class="stop">B</p><p id="c">C</p></section>');
      const fragment = content[0].parent, parent = $('main')[0];
      $(parent).append(fragment);
      const all = content.find('p').get(), roots = $([all[0], all[1], all[0]]);
      for (const [method, ordinary] of [['nextUntil', 'nextAll'], ['prevUntil', 'prevAll'], ['parentsUntil', 'parents']]) {
        for (const stop of ['main p', 'section > p', '.stop', 'p:not(.stop)', ':has(p)', ':contains(B)', ':is(.stop, #c)']) {
          const expected = [];
          for (const origin of roots) for (const node of $(origin)[ordinary]()) {
            if ($(node).is(stop)) break;
            if (!expected.includes(node)) expected.push(node);
          }
          const actual = roots[method](stop).get();
          assert.equal(actual.length, expected.length);
          if (method === 'parentsUntil') assert(actual.every(node => expected.includes(node)));
          else for (let i = 0; i < expected.length; i++) assert.equal(actual[i], expected[i]);
          assert.equal(fragment.parent, parent);
        }
      }
      assert.throws(() => $(all[0]).nextUntil('['));
      assert.equal(fragment.parent, parent);
      assert.equal($(all[0]).nextUntil('.stop').length, 0);
    } finally { $.dispose(); }
  });
}
