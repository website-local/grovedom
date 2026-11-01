import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';

const disposed = { code: 'ERR_GROVEDOM_DISPOSED' };
const markup = '<main><section id="left"><i id="a" class="alpha beta">A</i></section>'
  + '<section id="right"><i id="b" class="gamma">B</i></section><i id="c">C</i></main>';

for (const xml of [false, true]) for (const execution of ['buffered', 'direct']) {
  const options = { xml, execution }, label = `xml=${xml}, ${execution}`;

  test(`attribute maps retain occurrence and per-node key snapshots (${label})`, () => {
    const $ = load(markup, options);
    try {
      const a = $('#a')[0], b = $('#b')[0], c = $('#c')[0], selected = $([a, b, a]);
      let visits = 0;
      const values = {
        get 'data-visit'() {
          if (++visits === 1) {
            selected[1] = c;
            selected.splice(2, 1);
            delete values['data-deleted'];
            values['data-added'] = 'later';
          }
          return visits;
        },
        'data-deleted': 'initial',
      };
      assert.equal(selected.attr(values) === selected, true);
      assert.equal(visits, 3);
      assert.equal(selected.length, 2);
      assert.equal($(a).attr('data-visit'), '3');
      assert.equal($(b).attr('data-visit'), '2');
      assert.equal($(c).attr('data-visit'), undefined);
      assert.equal($(a).attr('data-deleted'), 'undefined');
      assert.equal($(b).attr('data-deleted'), undefined);
      assert.equal($(a).attr('data-added'), 'later');
      assert.equal($(b).attr('data-added'), 'later');
    } finally { $.dispose(); }
  });

  test(`map coercion keeps nested callback writes on their own nodes (${label})`, () => {
    const $ = load(markup, options);
    try {
      const a = $('#a'), b = $('#b'), events = [];
      const value = { toString() {
        events.push('coerce');
        b.attr('title', function (i, old) {
          events.push([i, old ?? null, this === b[0]]);
          return 'inner';
        });
        return 'outer';
      } };
      a.attr({ title: value, 'data-null': null, 'data-undefined': undefined });
      assert.equal(a.attr('title'), 'outer');
      assert.equal(b.attr('title'), 'inner');
      assert.equal(a.attr('data-null'), undefined);
      assert.equal(a.attr('data-undefined'), 'undefined');
      a.prop({ title: value, 'data-null': null, 'data-undefined': undefined });
      assert.equal(a.attr('title'), 'outer');
      assert.equal(b.attr('title'), 'inner');
      assert.equal(a.attr('data-null'), 'null');
      assert.equal(a.attr('data-undefined'), 'undefined');
      assert.deepEqual(events, ['coerce', [0, null, true], 'coerce', [0, 'inner', true]]);
    } finally { $.dispose(); }
  });

  test(`map setters preserve disposal and invalid-name coercion boundaries (${label})`, () => {
    for (const method of ['attr', 'prop']) {
      const $ = load(markup, options), selected = $('#a'), events = [];
      try {
        const values = { get title() {
          events.push('get');
          $.dispose();
          return { toString() { events.push('coerce'); return 'value'; } };
        } };
        assert.throws(() => selected[method](values), disposed);
        assert.deepEqual(events, method === 'attr' ? ['get', 'coerce'] : ['get']);
      } finally { $.dispose(); }
      const live = load(markup, options), invalidEvents = [];
      try {
        assert.throws(() => live('#a')[method]({ 'bad name': {
          toString() { invalidEvents.push('coerce'); return 'value'; },
        } }), /Invalid attribute name/);
        assert.deepEqual(invalidEvents, method === 'attr' ? ['coerce'] : []);
      } finally { live.dispose(); }
    }
  });

  test(`property maps preserve ordinary, boolean and structural writes (${label})`, () => {
    const $ = load(markup, options);
    try {
      const selected = $('#a, #b'), nodes = selected.get();
      selected.prop({ title: 'first', hidden: true, checked: false, tagName: 'em', textContent: 'new' });
      assert.equal($(nodes[0]).attr('title'), 'first');
      assert.equal($(nodes[1]).attr('hidden'), xml ? 'true' : 'hidden');
      assert.equal($(nodes[1]).attr('checked'), xml ? 'false' : undefined);
      assert.equal($(nodes[0]).prop('tagName'), 'EM');
      assert.equal(selected.text(), 'newnew');
      let visits = 0;
      const values = { get title() {
        if (++visits === 1) selected.splice(1, 1);
        return visits;
      } };
      selected.prop(values);
      assert.equal(visits, 2);
      assert.equal($(nodes[1]).attr('title'), '2');
      const error = new Error('property getter');
      assert.throws(() => selected.prop({ 'data-before': 'kept', get title() { throw error; } }), e => e === error);
      assert.equal(selected.attr('data-before'), 'kept');
    } finally { $.dispose(); }
  });

  test(`whole-class toggles share saved values with callback toggles (${label})`, () => {
    const $ = load(markup, options);
    try {
      const a = $('#a')[0], b = $('#b')[0], selected = $([a, b, a]);
      assert.equal(selected.toggleClass() === selected, true);
      assert.equal($(a).attr('class'), 'alpha beta');
      assert.equal($(b).attr('class'), '');
      selected.toggleClass();
      assert.equal($(a).attr('class'), 'alpha beta');
      assert.equal($(b).attr('class'), 'gamma');
      $('#a, #b').toggleClass(function () { return undefined; }).toggleClass(true);
      assert.equal($(a).attr('class'), 'alpha beta');
      assert.equal($(b).attr('class'), 'gamma');
      $(a).toggleClass(false).toggleClass(false).toggleClass();
      assert.equal($(a).attr('class'), 'alpha beta');
      const text = a.firstChild;
      $(text).toggleClass();
      assert.equal(text.data, 'A');
    } finally { $.dispose(); }
  });

  test(`string wrapping clones wrappers and preserves selected identities (${label})`, () => {
    const $ = load(markup, options);
    try {
      const selected = $('#a, #b'), nodes = selected.get();
      assert.equal(selected.wrap('<article><div><b></b><strong>tail</strong></div></article>') === selected, true);
      assert.equal($('article').length, 2);
      assert.equal($('article strong').text(), 'tailtail');
      assert.equal($('article b').eq(0).children()[0] === nodes[0], true);
      assert.equal($('article b').eq(1).children()[0] === nodes[1], true);
      $('main').append('<aside id="wrapper"><em></em></aside>');
      const original = $('#wrapper')[0];
      $('#c').wrap('#wrapper');
      assert.equal($(original).find('#c').length, 0);
      assert.equal($('#c').parent()[0] === original.firstChild, false);
      assert.equal($('#c').parent().prop('tagName'), 'EM');
      const before = $.html();
      $.root().wrap('<div></div>');
      assert.equal($.html(), before);
    } finally { $.dispose(); }
  });

  test(`closest retains order, identity, context and live predicate traversal (${label})`, () => {
    const $ = load(markup, options);
    try {
      const left = $('#left')[0], right = $('#right')[0], a = $('#a')[0], b = $('#b')[0];
      const selected = $([b, a, a]), result = selected.closest('section');
      assert.equal(result.length, 2);
      assert.equal(result[0] === right, true);
      assert.equal(result[1] === left, true);
      assert.equal(result.end() === selected, true);
      assert.equal($(a).closest('section', left).length, 0);
      const seen = [];
      const moved = $(a).closest(function (i, node) {
        seen.push([i, node.attribs.id, this === node]);
        if (node === a) { $(right).append(a); return false; }
        return node === right;
      });
      assert.deepEqual(seen, [[0, 'a', true], [0, 'right', true]]);
      assert.equal(moved[0] === right, true);
    } finally { $.dispose(); }
  });

  test(`has nodes preserves duplicate roots, excludes self and resolves per visit (${label})`, () => {
    const $ = load(markup, options);
    try {
      const left = $('#left')[0], right = $('#right')[0], a = $('#a')[0], b = $('#b')[0];
      const selected = $([right, left, left]), targets = [a, b];
      const result = selected.has(targets);
      assert.equal(result.length, 3);
      assert.equal(result[0] === right, true);
      assert.equal(result[1] === left, true);
      assert.equal(result[2] === left, true);
      assert.equal(result.end() === selected, true);
      assert.equal($(left).has(left).length, 0);
      let visits = 0;
      const changing = [];
      Object.defineProperty(changing, 0, { get() {
        visits++;
        if (visits === 1) selected.splice(1, 1);
        return visits === 2 ? left : a;
      } });
      const changed = selected.has(changing);
      assert.equal(visits, 3);
      assert.equal(changed.length, 1);
      assert.equal(changed[0] === left, true);
    } finally { $.dispose(); }
  });

  test(`direct method paths reject disposed empty selections (${label})`, () => {
    const $ = load(markup, options), empty = $('missing');
    $.dispose();
    assert.throws(() => empty.attr({ title: 'x' }), disposed);
    assert.throws(() => empty.prop({ title: 'x' }), disposed);
    assert.throws(() => empty.toggleClass(), disposed);
    assert.throws(() => empty.wrap(''), disposed);
    assert.throws(() => empty.closest(''), disposed);
    assert.throws(() => empty.has(null), disposed);
  });

  test(`has checks disposal after resolving an empty array input (${label})`, () => {
    const $ = load(markup, options), selected = $('section');
    try {
      const input = new Proxy([], { get(target, key, receiver) {
        if (key === 'length') $.dispose();
        return Reflect.get(target, key, receiver);
      } });
      assert.throws(() => selected.has(input), disposed);
    } finally { $.dispose(); }
  });
}
