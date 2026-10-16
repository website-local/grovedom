import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { load as cheerio } from 'cheerio';

for (const xml of [false, true]) for (const execution of ['buffered', 'direct']) {
  function parity(name, run, source) {
    test(`${name} (xml=${xml}, ${execution})`, () => {
      const $ = load(source, { xml, execution }, false), c = cheerio(source, { xml }, false);
      try { assert.deepEqual(run($), run(c)); } finally { $.dispose(); }
    });
  }

  parity('mutated attribute spellings retain distinct lowercase id/class values', $ => {
    const p = $('p'), handle = p[0];
    const queries = ['#old', '#new', '.original', '.added', '[title]', '[Title]'];
    const before = queries.map(query => $(query).length);
    p.attr({ ID: 'new', CLASS: 'added', Title: 'new', Custom: 'mixed', custom: 'lower' });
    const after = queries.map(query => $(query).length);
    const snapshot = { ...p.attr() }, clone = p.clone();
    p.removeAttr('ID CLASS').attr({ ID: 'again', CLASS: 'again' });
    p.attr({ id: 'lower-updated', class: 'lower-updated' });
    return { before, after, snapshot, clone: clone.toString(), html: p.toString(), same: p[0] === handle,
      attrs: { ...p.attr() }, lower: ['#lower-updated', '.lower-updated', '#again', '.again'].map(q => $(q).length) };
  }, '<main><p id="old" class="original" title="old">one</p></main>');

  parity('mixed-case names do not acquire lowercase id/class roles when inserted first', $ => {
    const p = $('p');
    p.attr({ ID: 'upper', CLASS: 'upper', id: 'lower', class: 'lower' });
    const before = ['#upper', '#lower', '.upper', '.lower'].map(q => $(q).length);
    p.removeAttr('id class');
    const after = ['#upper', '#lower', '.upper', '.lower'].map(q => $(q).length);
    return { before, after, attrs: { ...p.attr() }, html: p.toString() };
  }, '<p></p>');

  for (const initial of ['', ' viewBox="0 0 1 1"']) parity(`SVG insertion and reinsertion preserve viewBox${initial}`, $ => {
    const svg = $('svg');
    svg.attr('viewBox', '0 0 10 10');
    const updated = svg.toString();
    svg.removeAttr('viewBox').attr('viewBox', '0 0 20 20');
    const clone = svg.clone();
    svg.prop('name', 'g');
    return { updated, html: svg.toString(), clone: clone.toString(), attrs: { ...svg.attr() } };
  }, `<svg${initial}></svg>`);

  parity('exact names and foreign namespace history survive clone and reinsert', $ => {
    const svg = $('svg'), key = xml ? 'xlink:href' : 'href';
    svg.removeAttr(key).attr(key, 'next');
    svg.attr({ HREF: 'upper', 'data-Custom': 'mixed', 'data-custom': 'lower', 'x-Café': 'non-ascii' });
    const clone = svg.clone();
    clone.removeAttr(key).attr(key, 'clone');
    return { html: svg.toString(), attrs: { ...svg.attr() }, clone: clone.toString(), cloneAttrs: { ...clone.attr() } };
  }, '<svg xlink:href="old"></svg>');

  parity('shared interned attribute names preserve exact spelling across elements', $ => {
    const selected = $('p'), key = 'data-' + 'MixedName'.repeat(20);
    selected.attr({ ID: 'UPPER', id: 'lower', [key]: 'first' });
    selected.first().attr(key, 'a'.repeat(128));
    selected.last().removeAttr(key).attr(key, 'last');
    return { attrs: selected.get().map(node => ({ ...node.attribs })), html: $.html(), ids: $('#lower').length };
  }, '<main><p></p><p></p></main>');
}
