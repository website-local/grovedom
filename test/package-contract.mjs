// Public-API checks shared by source tests and empty, offline package consumers.
// No diagnostic imports or Cheerio dependency can hide a packaging regression.
import assert from 'node:assert/strict';

export const packageCases = [
  {
    name: 'HTML callbacks, partial effects and selection snapshots',
    run({ load, contains, merge }, execution) {
      const $ = load('<main><p data-v="a">A</p><p data-v="b">B</p></main>', { execution }, false);
      try {
        const selected = $('p'), nodes = selected.get(), events = [];
        assert.equal(contains($('main')[0], nodes[0]), true);
        assert.equal($.contains(nodes[0], nodes[0]), false);
        const merged = { 0: nodes[0], length: 1 };
        assert.equal(merge(merged, [nodes[1]]), merged);
        assert.equal(merged[1], nodes[1]);
        assert.equal(merged.length, 2);
        assert.equal(selected.attr('data-v', function (i, old) {
          events.push([i, old, this === nodes[i], selected.first().attr('data-v')]);
          return old + i;
        }), selected);
        assert.deepEqual(events, [[0, 'a', true, 'a'], [1, 'b', true, 'a0']]);
        const sentinel = new Error('callback sentinel');
        assert.throws(() => selected.attr('data-v', function (i, old) {
          $(this).attr('data-side', 'kept');
          if (i === 1) throw sentinel;
          return old + '!';
        }), error => error === sentinel);
        assert.deepEqual(selected.get().map(node => $(node).attr('data-v')), ['a0!', 'b1']);
        assert.deepEqual(selected.get().map(node => $(node).attr('data-side')), ['kept', 'kept']);
        selected.first().remove();
        $('main').append('<p>C</p>');
        assert.deepEqual(selected.get(), nodes);
        assert.equal($(nodes[0]).text(), 'A');
        assert.equal(nodes[0].parent, null);
        assert.equal($('main').html(), '<p data-v="b1" data-side="kept">B</p><p>C</p>');
      } finally { $.dispose(); }
    },
  },
  {
    name: 'XML case, entities and byte-array offsets',
    run({ load }, execution) {
      const source = '<Root><Item Key="A&amp;B">é😀</Item><item Key="lower"/></Root>';
      const bytes = new TextEncoder().encode('prefix' + source + 'suffix');
      const $ = load(bytes.subarray(6, bytes.length - 6), { xml: true, execution });
      try {
        assert.equal($('Item').length, 1);
        assert.equal($('item').length, 1);
        assert.equal($('ITEM').length, 0);
        assert.equal($('Item').attr('Key'), 'A&B');
        assert.equal($('Item').attr('key'), undefined);
        assert.equal($('Item').text(), 'é😀');
        $('Item').attr('Key', 'new & "value"').text('changed <&>');
        assert.equal($.xml(), '<Root><Item Key="new &amp; &quot;value&quot;">changed &lt;&amp;&gt;</Item><item Key="lower"/></Root>');
      } finally { $.dispose(); }
    },
  },
  {
    name: 'large transfers, disposal and subsequent owners',
    run({ load }, execution) {
      const $ = load('<p/>', { xml: true, execution });
      const other = load('<p>other owner</p>', { execution });
      const retained = $('p'), handle = retained[0], value = 'é😀<&"'.repeat(12000);
      try {
        retained.attr('long', value).text(value);
        const attributes = retained.attr(), text = retained.text(), serialized = $.xml();
        assert.equal(attributes.long, value);
        assert.equal(text, value);
        assert(serialized.includes('&lt;&amp;'));
        assert.throws(() => other(handle), TypeError);
        $.dispose();
        $.dispose();
        const fresh = load('<p>fresh owner</p>', { execution });
        try {
          assert.throws(() => retained.text(), { code: 'ERR_GROVEDOM_DISPOSED' });
          assert.throws(() => handle.name, { code: 'ERR_GROVEDOM_DISPOSED' });
          assert.equal(attributes.long, value);
          assert.equal(text, value);
          assert.equal(fresh('p').text(), 'fresh owner');
          assert.equal(other('p').text(), 'other owner');
        } finally { fresh.dispose(); }
      } finally { $.dispose(); other.dispose(); }
    },
  },
  {
    name: 'GroveDOM callback and whole-class conveniences',
    run({ load }, execution) {
      const $ = load('<main><p class="a b">one</p><p>two</p></main>', { execution });
      try {
        const selected = $('p'), events = [];
        assert.equal(selected.html(function (i, old) {
          events.push([i, old, this === selected[i]]);
          return '<b>' + old + i + '</b>';
        }), selected);
        assert.deepEqual(events, [[0, 'one', true], [1, 'two', true]]);
        const first = selected.first();
        first.toggleClass(false);
        assert.equal(first.attr('class'), '');
        first.toggleClass(true);
        assert.equal(first.attr('class'), 'a b');
        assert.equal($.flush(), undefined);
        assert.equal(selected.text(), 'one0two1');
      } finally { $.dispose(); }
    },
  },
  {
    name: 'raw XML attribute quotes remain framed', corrected: true,
    run({ load }, execution) {
      const $ = load('<Root><Item/></Root>', { xml: true, execution });
      try {
        $('Item').attr('q', 'a"b & <é😀>');
        const options = { xmlMode: true, encodeEntities: false };
        assert.equal($.html(options), '<Root><Item q="a&quot;b & <é😀>"/></Root>');
        assert.equal($.html($('Item').get(), options), '<Item q="a&quot;b & <é😀>"/>');
        // Like Cheerio, passing an existing selection retains its own render options.
        assert.equal($.html($('Item'), options), '<Item q="a&quot;b &amp; &lt;&#xe9;&#x1f600;&gt;"/>');
        assert.equal($('Item').attr('q'), 'a"b & <é😀>');
      } finally { $.dispose(); }
    },
  },
  {
    name: 'template query roots and element sibling positions', corrected: true,
    run({ load }, execution) {
      const $ = load('<main><p id="a"></p><!--gap--><p id="b"></p><template>' +
        '<section id="inside"><b id="nested">T</b></section></template></main>', { execution });
      try {
        assert.equal($('main > p:nth-child(2)')[0], $('#b')[0]);
        const roots = $([$('main')[0], $('#inside')[0]]);
        assert.deepEqual(roots.find('b').get(), [$('#nested')[0]]);
        $('#inside').appendTo('main');
        assert.deepEqual(roots.find('b').get(), [$('#nested')[0]]);
        assert.equal(roots.find('b').end(), roots);
      } finally { $.dispose(); }
    },
  },
  {
    name: 'lazy data keys and non-element attribute callbacks', corrected: true,
    run({ load }, execution) {
      const $ = load('<main>text<p data-a="1" data-b="2"></p><!--gap--><p></p></main>', { execution });
      try {
        const first = $('p').first();
        assert.equal(first.data('a'), 1);
        first.attr('data-b', '3');
        assert.equal(first.data('b'), 3);
        first.data('test-key', 4);
        assert.equal(first.data('test-key'), 4);
        assert.equal(first.data('testKey'), undefined);
        const events = [];
        $('main').contents().attr('x', function (i, old) { events.push([i, old]); return undefined; });
        assert.deepEqual(events, [[1, undefined], [3, undefined]]);
        assert.deepEqual($('p').get().map(node => $(node).attr('x')), ['undefined', 'undefined']);
      } finally { $.dispose(); }
    },
  },
];

export function checkPackage(api, { corrected = true } = {}) {
  for (const key of ['load', 'contains', 'merge']) assert.equal(typeof api[key], 'function', key);
  let cases = 0;
  for (const execution of ['buffered', 'direct']) for (const item of packageCases) {
    if (item.corrected && !corrected) continue;
    try { item.run(api, execution); }
    catch (cause) { throw new Error(`${item.name}, ${execution}`, { cause }); }
    cases++;
  }
  return cases;
}
