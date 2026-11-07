import test from 'node:test';
import assert from 'node:assert/strict';
import { load, loadFast } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

const markup = '<main><p id="a" style="color: red; width: 1px;">A</p>'
  + '<p id="b" style="color: green;">B</p><p id="c">C</p></main>';
const disposed = { code: 'ERR_GROVEDOM_DISPOSED' };

for (const [mode, loader] of [['compatible', load], ['fast', loadFast]]) {
  for (const xml of [false, true]) for (const execution of ['buffered', 'direct']) {
    const options = { xml, execution }, label = `${mode}, xml=${xml}, ${execution}`;
    function check(name, run) {
      test(`${name} (${label})`, () => {
        const $ = loader(markup, options, false);
        try { run($); } finally { $.dispose(); }
      });
    }
    function parity(name, run) {
      check(name, $ => assert.deepEqual(run($), run(cheerio(markup, { xml }, false))));
    }

    parity('style maps expose each write before later getters and callbacks', $ => {
      const events = [], nodes = $('p').slice(0, 2);
      assert.equal(nodes.css({
        get color() {
          events.push(nodes.get().map(node => node.attribs.style));
          return function (index, old) {
            events.push([this.attribs.id, index, old]);
            return 'blue';
          };
        },
        width(index, old) {
          events.push([this.attribs.id, index, old, this.attribs.style]);
          return '2px';
        },
      }), nodes);
      return [events, $.html()];
    });

    parity('style maps observe an attribute replaced by a later getter', $ => {
      const node = $('#a'), events = [];
      node.css({
        color: 'blue',
        get width() {
          events.push(node.attr('style'));
          node.attr('style', 'height: 3px; width: 4px;');
          return function (index, old) { events.push([index, old]); return '6px'; };
        },
        height(index, old) { events.push([index, old]); return '5px'; },
      });
      return [events, $.html()];
    });

    parity('style value coercion preserves nested writes and property snapshots', $ => {
      const node = $('#a'), events = [];
      node.css({
        color: 'blue',
        width(index, old) {
          events.push([index, old]);
          return { toString() {
            events.push(node.attr('style'));
            node.css('height', '9px');
            $('#b').css('color', 'purple');
            return '7px';
          } };
        },
        height(index, old) { events.push([index, old]); return '3px'; },
      });
      return [events, $.html()];
    });

    parity('style maps retain parsing between malformed or noncanonical declarations', $ => {
      const outputs = [];
      for (const [key, value] of [
        ['color', ' red '], ['color', 'red; width: 4px'], ['color', 'foo;tail'],
        ['color', 'x:y'], ['color', ''], ['color', null], ['color', undefined],
        ['', 'x'], [' width ', '4px'], ['x:y', 'z'], ['x;y', 'z'],
        ['constructor', 'custom'], ['__proto__', 'custom'],
      ]) {
        const node = $('#a'), events = [];
        node.attr('style', 'color: red; odd: value;tail; width: 1px;');
        const map = Object.fromEntries([[key, value], ['height', function (index, old) {
          events.push([index, old, this.attribs.style]);
          return '2px';
        }], ['display', 'block']]);
        node.css(map);
        outputs.push([node.attr('style'), events]);
      }
      return outputs;
    });

    for (const exposure of ['setter', 'getter', 'coercion']) {
      check(`style maps reparse after an inherited ${exposure} exposes the style object`, $ => {
        const key = 'operationStyle', previous = Object.getOwnPropertyDescriptor(Object.prototype, key);
        let exposed;
        function install() {
          Object.defineProperty(Object.prototype, key, {
            configurable: true,
            get() { exposed = this; return 'inherited'; },
            set(value) {
              exposed = this;
              Object.defineProperty(this, key, { value, enumerable: true, configurable: true, writable: true });
            },
          });
        }
        try {
          if (exposure !== 'coercion') install();
          const node = $('#a'), events = [];
          node.css({
            [key]: exposure === 'getter' ? function (index, old) {
              events.push([index, old]); return null;
            } : exposure === 'coercion' ? { toString() { install(); return 'initial'; } } : 'initial',
            get height() { exposed.width = '7px'; return '2px'; },
          });
          assert.equal(node.css('width'), '1px');
          assert.equal(node.attr('style'), 'color: red; width: 1px;'
            + (exposure === 'getter' ? '' : ' operationStyle: initial;') + ' height: 2px;');
          assert.deepEqual(events, exposure === 'getter' ? [[0, 'inherited']] : []);
        } finally {
          if (previous) Object.defineProperty(Object.prototype, key, previous);
          else delete Object.prototype[key];
        }
      });
    }

    check('style maps retain node occurrences and per-node key snapshots', $ => {
      const a = $('#a').get(0), b = $('#b').get(0), selected = $([a, b, a]);
      let visits = 0;
      const map = {
        get color() {
          if (++visits === 1) {
            selected.splice(1, 2);
            delete map.later;
            map.added = 'kept';
          }
          return 'blue' + visits;
        },
        later: 'removed',
      };
      assert.equal(selected.css(map), selected);
      assert.equal(visits, 3);
      assert.equal(selected.length, 1);
      assert.equal($(a).css('color'), 'blue3');
      assert.equal($(b).css('color'), 'blue2');
      assert.equal($(a).css('later'), undefined);
      assert.equal($(b).css('later'), undefined);
      assert.equal($(a).css('added'), 'kept');
      assert.equal($(b).css('added'), 'kept');
    });

    check('style getter errors preserve earlier effects only', $ => {
      const stop = new Error('stop style map');
      assert.throws(() => $('p').css({ color: 'blue', get width() { throw stop; } }), error => error === stop);
      assert.equal($('#a').css('color'), 'blue');
      assert.equal($('#a').css('width'), '1px');
      assert.equal($('#b').css('color'), 'green');
    });

    check('style getter disposal precedes returned-value coercion', $ => {
      const events = [];
      assert.throws(() => $('#a').css({ color: 'blue', get width() {
        events.push('get');
        $.dispose();
        return { toString() { events.push('coerce'); return '2px'; } };
      } }), disposed);
      assert.deepEqual(events, ['get']);
    });

    check('style callback disposal retains its value-coercion boundary', $ => {
      const events = [];
      assert.throws(() => $('#a').css({ color: 'blue', width(index, old) {
        events.push([index, old]);
        $.dispose();
        return { toString() { events.push('coerce'); return '2px'; } };
      } }), disposed);
      assert.deepEqual(events, [[1, '1px'], 'coerce']);
    });

    check('literal wrapping retains duplicates, skipped roots and independent wrapper trees', $ => {
      const a = $('#a').get(0), b = $('#b').get(0), root = $.root().get(0);
      const selected = $([root, a, b, a, root]);
      assert.equal(selected.wrap('<article><div><i>old</i><strong>tail</strong></div></article> '), selected);
      assert.deepEqual(selected.get(), [root, a, b, a, root]);
      assert.equal($('article').length, 3);
      assert.equal($('article strong').text(), 'tailtailtail');
      assert.equal($('#a').get(0), a);
      assert.equal($('#b').get(0), b);
      assert.equal($(a).parents('article').length, 2);
      assert.equal($(b).parents('article').length, 1);
      const wrappers = $('article').get();
      assert.equal(new Set(wrappers).size, 3);
      $(wrappers[0]).attr('data-own', 'first');
      assert.equal($('article[data-own]').length, 1);
    });

    check('literal wrappers with a leading text or comment root preserve the targets', $ => {
      const original = $.html(), nodes = $('p');
      for (const wrapper of [' <article><i></i></article>', '<!--first--><article><i></i></article>']) {
        assert.equal(nodes.wrap(wrapper), nodes);
        assert.equal($.html(), original);
      }
    });

    parity('selector wrapping observes the current tree for each target', $ => {
      const selected = $([$('#b').get(0), $('#a').get(0)]);
      selected.wrap('p:last');
      return $.html();
    });

    check('wrapper callbacks preserve per-occurrence values and node snapshots', $ => {
      const nodes = $('p').slice(0, 2), saved = nodes.get(), events = [];
      nodes.wrap(function (index, node) {
        events.push([index, node === this, this === saved[index]]);
        if (index === 0) nodes.splice(1, 1);
        return index === 0 ? '<section><i></i></section>' : '<article><b></b></article>';
      });
      assert.deepEqual(events, [[0, true, true], [1, true, true]]);
      assert.equal($('#a').parent().prop('tagName'), 'I');
      assert.equal($('#b').parent().prop('tagName'), 'B');
      assert.equal(nodes.length, 1);
    });
  }
}
