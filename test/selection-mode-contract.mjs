import assert from 'node:assert/strict';

const source = '<main><i id="a">A</i><i id="b">B</i><i id="c">C</i></main>';
const disposed = { code: 'ERR_GROVEDOM_DISPOSED' };
const names = selected => JSON.stringify(selected.get().map(node => node.attribs.id));

export const selectionModeCases = [
  {
    name: 'selection modes preserve chaining, indexing and nested loads',
    run(api, execution) {
      for (const xml of [false, true]) for (const fast of [false, true]) {
        const $ = (fast ? api.loadFast : api.load)(source, { xml, execution }), selected = $('i');
        try {
          assert.equal(selected.length, 3);
          assert.equal(selected.get(-1).attribs.id, 'c');
          assert.equal('0' in selected, !fast);
          assert.equal(Object.hasOwn(selected, '0'), !fast);
          assert.equal(selected[0] === selected.get(0), !fast);
          const next = selected.eq(1).parent().children('i').filter('i').not('#c').slice(0, 1);
          assert.equal(next.text(), 'A');
          assert.equal('0' in next, !fast);
          assert.equal(selected.first().end() === selected, true);
          assert.equal(selected.each(() => {}) === selected, true);
          assert.equal('0' in $.root(), !fast);
          assert.equal('0' in selected.clone(), !fast);
          const nested = $.load('<p>nested</p>');
          try { assert.equal('0' in nested('p'), !fast); assert.equal(nested('p').text(), 'nested'); }
          finally { nested.dispose(); }
        } finally { $.dispose(); }
        assert.throws(() => selected.get(0), disposed);
      }
    },
  },
  {
    name: 'fast maps retain node selections and indexed generic values',
    run({ loadFast }, execution) {
      const $ = loadFast(source, { execution });
      try {
        const selected = $('i'), nodes = selected.map((index, node) => index === 1 ? null : [node, node]);
        assert.equal(names(nodes), '["a","a","c","c"]');
        assert.equal('0' in nodes, false);
        assert.equal(nodes.end() === selected, true);
        const values = selected.map((index, node) => [node.name, index]);
        assert.equal(JSON.stringify(values.get()), '["i",0,"i",1,"i",2]');
        assert.equal(values[0], 'i');
        assert.equal(values.end() === selected, true);
        assert.equal(values.slice(1).end() === values, true);
        const opaque = selected.map(() => selected);
        assert.equal(opaque[0] === selected, true);
        selected.data('self', selected).prop('data', selected);
        assert.equal(selected.prop('data') === selected, true);
      } finally { $.dispose(); }
    },
  },
  {
    name: 'fast callbacks preserve snapshots, receivers and partial writes',
    run({ loadFast }, execution) {
      for (const xml of [false, true]) {
        const $ = loadFast(source, { xml, execution });
        try {
          const selected = $('i'), nodes = selected.get(), events = [];
          selected.each(function (index, node) {
            events.push([index, this === node, node === nodes[index]]);
            if (index === 0) selected.splice(1, 1);
          });
          assert.equal(JSON.stringify(events), '[[0,true,true],[1,true,true],[2,true,true]]');
          assert.equal(names(selected), '["a","c"]');
          const error = new Error('callback stopped');
          assert.throws(() => $(nodes).attr('title', function (index, old) {
            assert.equal(this === nodes[index], true); assert.equal(old, undefined);
            $(this).attr('data-side', index);
            if (index === 1) throw error;
            return 'first';
          }), value => value === error);
          assert.equal($(nodes[0]).attr('title'), 'first');
          assert.equal($(nodes[1]).attr('data-side'), '1');
          assert.equal($(nodes[2]).attr('data-side'), undefined);
          const value = { toString() { $(nodes[1]).attr('nested', 'yes'); return 'outer'; } };
          $(nodes[0]).attr({ title: value });
          assert.equal($(nodes[0]).attr('title'), 'outer');
          assert.equal($(nodes[1]).attr('nested'), 'yes');
        } finally { $.dispose(); }
      }
    },
  },
  {
    name: 'fast merge reads live members and keeps earlier selection snapshots',
    run({ loadFast, merge }, execution) {
      const $ = loadFast(source, { execution });
      try {
        const selected = $('i'), nodes = selected.get(), snapshot = selected.slice(0, 2);
        const destination = { length: 0 };
        Object.defineProperty(destination, '0', { set(node) {
          assert.equal(node === nodes[0], true);
          selected.splice(1, 1, nodes[2]);
        } });
        assert.equal(merge(destination, selected) === destination, true);
        assert.equal(destination[1] === nodes[2], true);
        assert.equal(destination.length, 3);
        assert.equal(names(snapshot), '["a","b"]');
        assert.equal($.merge(selected, snapshot) === selected, true);
        assert.equal(names(selected), '["a","c","c","a","b"]');
        assert.equal(names(snapshot), '["a","b"]');
        const array = [];
        assert.equal(merge(array, snapshot) === array, true);
        assert.equal(array[0] === nodes[0] && array[1] === nodes[1], true);
      } finally { $.dispose(); }
    },
  },
  {
    name: 'fast callbacks, iterators and merge honor disposal boundaries',
    run({ loadFast, merge }, execution) {
      for (const operation of ['callback', 'coercion', 'iterator', 'merge']) {
        const $ = loadFast(source, { execution }), selected = $('i'), node = selected.get(0);
        try {
          if (operation === 'callback')
            assert.throws(() => selected.attr('x', () => { $.dispose(); return 'x'; }), disposed);
          else if (operation === 'coercion')
            assert.throws(() => selected.attr({ x: { toString() { $.dispose(); return 'x'; } } }), disposed);
          else if (operation === 'iterator') {
            const iterator = selected[Symbol.iterator]();
            assert.equal(iterator.next().value === node, true);
            $.dispose();
            assert.throws(() => iterator.next(), disposed);
          } else {
            const destination = { length: 0 };
            Object.defineProperty(destination, '0', { set() { $.dispose(); } });
            assert.throws(() => merge(destination, selected), disposed);
          }
          assert.throws(() => selected.get(0), disposed);
          assert.throws(() => node.name, disposed);
        } finally { $.dispose(); }
      }
    },
  },
  {
    name: 'mixed modes share methods while contexts retain their document mode',
    run({ load, loadFast, contains }, execution) {
      const compatible = load(source, { execution }), fast = loadFast(source, { execution });
      try {
        const a = compatible('i'), b = fast('i');
        assert.equal(a.each === b.each && a.attr === b.attr, true);
        assert.equal(Object.getPrototypeOf(a) === Object.getPrototypeOf(b), true);
        assert.equal('0' in compatible('i', fast('main')), false);
        assert.equal('0' in fast('i', compatible('main')), true);
        assert.equal('0' in compatible('i', fast('main').get(0)), false);
        assert.equal('0' in fast('i', compatible('main').get(0)), true);
        // Markup construction uses the receiving document even with a foreign context.
        assert.equal('0' in fast('<u>x</u>', compatible('main')), false);
        assert.equal('0' in compatible('<u>x</u>', fast('main')), true);
        assert.equal(a.attr.call(b, 'title', 'raw') === b, true);
        assert.equal('0' in a.first.call(b), false);
        assert.equal(contains(a.get(0), b.get(0)), false);
        assert.throws(() => compatible(b), /Expected|document|owner/i);
        compatible.dispose();
        assert.equal(b.text(), 'ABC');
      } finally { compatible.dispose(); fast.dispose(); }
    },
  },
];
