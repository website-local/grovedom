import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../src/index.js';
import { load as cheerio } from 'cheerio';

const misses = '#missing-a, .missing-b, absent-c, .missing-d, #missing-e, absent-f, .missing-g';
const names = ($, selection) => selection.map((_, node) => $(node).attr('id') ?? node.name).get();

test('tag queries preserve nested template scopes, overlapping roots and snapshots', () => {
  const trace = loader => {
    const $ = loader('<main><section><mark id="a"></mark><template><mark id="b"></mark><template><mark id="c"></mark></template></template></section><mark id="d"></mark></main>');
    try {
      const snapshot = $('mark');
      const result = [names($, snapshot), names($, $('main, section').find('mark')),
        names($, $('template').find('mark')), names($, $('template').contents().find('mark')),
        names($, $('*').filter('mark'))];
      $('section').append('<mark id="new"></mark>');
      result.push(names($, snapshot), names($, $('mark')), $.html());
      return result;
    } finally { $.dispose?.(); }
  };
  assert.deepEqual(trace(load), trace(cheerio));
});

test('XML tag queries resolve cached misses and retain case through cache churn and renaming', () => {
  const trace = loader => {
    const $ = loader('<Root><Group><Thing id="a"/></Group><Thing id="b"/><thing id="c"/></Root>', { xml: true });
    try {
      const snapshot = $('Thing'), detached = snapshot.first();
      const result = [names($, $('Later')), names($, $('Renamed'))];
      $('Group').append('<Later id="later"/><Thing id="new"/>');
      $('thing')[0].name = 'Thing';
      $('#b')[0].name = 'Renamed';
      result.push(names($, $('Thing')), names($, $('Later')), names($, $('Renamed')));
      for (let i = 0; i < 40; i++) $('Missing' + i + '[data-missing]');
      detached.remove();
      result.push(names($, $('Root, Group').find('Thing')), names($, snapshot),
        detached.is('Thing'), names($, $('*').filter('Thing')), $.xml());
      return result;
    } finally { $.dispose?.(); }
  };
  assert.deepEqual(trace(load), trace(cheerio));
});

test('simple selectors preserve duplicate IDs, escapes, fragments and changed names', () => {
  const trace = loader => {
    const $ = loader('<!doctype html><main><p id="dup" class="a+b\fplain">one</p><p id="dup" class="plain">two</p><template><p class="plain">three</p></template></main>');
    try {
      const result = [$('#dup').length, $('.a\\+b').length, $('.plain').length,
        $('main').find('.plain').length, $('not-yet-known').length];
      $('p').first()[0].name = 'not-yet-known';
      result.push($('not-yet-known').text(), $('p').length, $('*').filter('#dup').length);
      return result;
    } finally { $.dispose?.(); }
  };
  assert.deepEqual(trace(load), trace(cheerio));
});

test('long selector lists preserve compounds, classes, IDs, scopes and snapshots', () => {
  const trace = loader => {
    const $ = loader('<!doctype html><main><section id="one" class="Alpha\tBeta\nGamma"><i id="child" class="target"></i></section><section id="two" class="alpha"><i id="hidden" class="target" data-hidden></i></section><template><i id="fragment" class="target"></i></template><i id="outside" class="target"></i></main>');
    const query = `${misses}, section.Alpha > i.target:not([data-hidden]), #two, .Gamma`;
    try {
      const selected = $(query);
      const result = [names($, selected), names($, $('main').find(`${misses}, .target`)),
        names($, $(`${misses}, .target`)), names($, $('i, section').filter(query))];
      $('#one').attr('class', 'gone');
      $('#two').attr('id', 'changed');
      result.push(names($, $(query)), names($, selected));
      $('main').append('<section id="three" class="Gamma"></section>');
      result.push(names($, $(query)));
      return result;
    } finally { $.dispose?.(); }
  };
  assert.deepEqual(trace(load), trace(cheerio));
});

test('cached long XML lists discover names introduced by insertion and renaming', () => {
  const trace = loader => {
    const $ = loader('<Root><Item id="first" class="Alpha"/></Root>', { xml: true });
    const query = `${misses}, FutureName, Renamed, .Alpha`;
    try {
      const result = [names($, $(query))];
      $('Root').append('<FutureName id="new"/>');
      result.push(names($, $(query)));
      $('Item')[0].name = 'Renamed';
      $('Renamed').removeAttr('class');
      result.push(names($, $(query)), names($, $('Root').find(query)));
      return result;
    } finally { $.dispose?.(); }
  };
  assert.deepEqual(trace(load), trace(cheerio));
});

test('dense matches followed by sparse matches stay ordered and deduplicated', () => {
  const trace = loader => {
    const $ = loader('<!doctype html><main>' + Array.from({ length: 160 }, (_, i) =>
      `<p id="n${i}" class="${i < 100 || i === 159 ? 'hit' : 'other'}"></p>`).join('') + '</main>');
    try {
      const query = `${misses}, .hit`;
      return [names($, $(query)), names($, $('main, body').find(query))];
    } finally { $.dispose?.(); }
  };
  assert.deepEqual(trace(load), trace(cheerio));
});

test('plain and general tag queries preserve options and recover after a selector failure', () => {
  for (const xml of [false, true, { lowerCaseTags: true, lowerCaseAttributeNames: true }]) {
    const trace = loader => {
      const $ = loader('<Root><Thing data-x="a">one</Thing><thing data-x="b">two</thing><X-Y/><x_y/><h2/></Root>', { xml });
      try {
        const result = [];
        for (const selector of ['Thing', ':is(Thing)', 'Thing:contains(one)', 'Thing', '[data-x]', 'X-Y', 'x_y', 'h2', '\\54 hing', '*:not(Thing)', 'Thing']) {
          result.push(names($, $(selector)));
        }
        assert.throws(() => $('['));
        result.push(names($, $('Thing')), names($, $('Future')));
        $('Root').append('<Future data-x="new"/>');
        result.push(names($, $('Future')), names($, $(':is(Future)')), $.html());
        return result;
      } finally { $.dispose?.(); }
    };
    assert.deepEqual(trace(load), trace(cheerio));
  }
});
