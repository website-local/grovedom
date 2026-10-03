import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../src/index.js';
import { load as cheerio } from 'cheerio';

function compare(source, run, options = { xml: true }) {
  const $ = load(source, options), reference = cheerio(source, options);
  try { assert.deepEqual(run($), run(reference)); } finally { $.dispose(); }
}

test('XML repeated names survive cache churn, recycling, renaming and document isolation', () => {
  const names = Array.from({ length: 130 }, (_, i) => 'Name' + i);
  const markup = names.map((name, i) => `<${name} ${name}="${i}" id="i${i}"/>`).join('');
  compare('<Root>' + markup + '</Root>', $ => {
    const retained = $('Name0')[0];
    $('Root').empty().append(markup).append('<Name0 Name0="again"/><name0 Name0="lower"/>');
    $(retained).attr('Name0', 'retained');
    $('Name129')[0].name = 'Name0';
    const clone = $('Root').clone();
    return [$.xml(), clone.toString(), $(retained).attr('Name0'),
      $('Name0').map((i, n) => $(n).attr('Name0')).get(), $('name0').length];
  });
  const a = load('<Root><Same Same="a"/></Root>', { xml: true });
  const b = load('<Root><Same Same="b"/></Root>', { xml: true });
  try { a.dispose(); b('Root').append('<Same Same="c"/>'); assert.equal(b('Same').last().attr('Same'), 'c'); }
  finally { a.dispose(); b.dispose(); }
});

test('XML cached names preserve case, duplicate attributes and lowercasing options', () => {
  const source = '<Root>' + '<Node id="one" id="two" ID="upper" class="a" CLASS="b" x:Name="v"/>'.repeat(40) + '</Root>';
  for (const xml of [true, { lowerCaseTags: true }, { lowerCaseAttributeNames: true },
    { lowerCaseTags: true, lowerCaseAttributeNames: true }]) {
    compare(source, $ => {
      const name = xml.lowerCaseTags ? 'node' : 'Node';
      $(name).attr('NewAttr', 'value');
      return [$.xml(), $(name).first().attr(), $('#one').length, $('.a').length, $('[ID]').length];
    }, { xml });
  }
});

for (const xml of [false, true]) for (const execution of ['direct', 'buffered']) {
  test(`callback setters observe intervening writes and preserve snapshots: xml=${xml}, ${execution}`, () => {
    compare('<root><item a="first">one</item><item a="second">two</item></root>', $ => {
      const items = $('item'), seen = [];
      items.attr('a', function (i, old) {
        seen.push([i, old, this === items[i]]);
        if (!i) { items.eq(1).attr('a', 'changed'); $('root').append('<item a="new">new</item>'); }
        return i ? null : old + '-done';
      });
      items.text(function (i, old) {
        seen.push([i, old, this === items[i]]);
        if (!i) items.eq(1).text('changed');
        return i ? undefined : old + '-done';
      });
      return [seen, $.html(), items.length];
    }, { xml, execution });
  });
}

test('callback setters still reject a write after disposal', () => {
  for (const method of ['text', 'attr']) {
    const $ = load('<root><item a="one"/></root>', { xml: true });
    assert.throws(() => method === 'text'
      ? $('item').text(() => { $.dispose(); return 'next'; })
      : $('item').attr('a', () => { $.dispose(); return 'next'; }), { code: 'ERR_GROVEDOM_DISPOSED' });
  }
});

test('callback command views refresh after growth and remain document-owned', () => {
  const markup = '<root>' + '<item/>'.repeat(90) + '</root>';
  compare(markup, $ => {
    const other = load('<root><item/></root>', { xml: true });
    try {
      const items = $('item');
      items.attr('a', (i) => {
        other('item').attr('a', 'other').text(String(i));
        assert.equal(other('item').attr('a'), 'other');
        return i === 30 ? 'é'.repeat(5000) : 'x'.repeat(i % 7 + 1);
      });
      items.text((i) => 't'.repeat(i % 9 + 1));
      items.attr('b', 'all');
      assert.equal(items.first().attr('b'), 'all');
      items.attr('b', (i, old) => old + i);
      return $.xml();
    } finally { other.dispose(); }
  });
});

test('XML callback coercion can reenter and selections retain the intended node', () => {
  compare('<root><item>one</item><item>two</item></root>', $ => {
    const items = $('item'), retained = [];
    items.attr('title', function (i) {
      if (!i) retained.push($(this));
      return { toString() {
        items.last().attr('side', () => 'nested');
        return 'title-' + i;
      } };
    });
    items.text(function (i, old) {
      return { toString() {
        items.last().attr('side', () => 'again');
        return old + '-' + i;
      } };
    });
    return [$.xml(), retained[0].attr('title'), retained[0][0] === items[0]];
  });
});

test('XML callback coercion cannot revive disposed command storage', () => {
  for (const method of ['text', 'attr']) {
    const $ = load('<root><item/></root>', { xml: true });
    const value = () => ({ toString() { $.dispose(); return 'closed'; } });
    assert.throws(() => method === 'text' ? $('item').text(value) : $('item').attr('a', value), { code: 'ERR_GROVEDOM_DISPOSED' });
  }
});
