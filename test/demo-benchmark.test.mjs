import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { load as slimLoad } from 'cheerio/slim';
import { compare, summarize } from '../demo/comparison.js';
import { cases, page, transform, caseSource, caseReplay } from '../demo/workload.js';
import * as localXML from '../bench/xml-fixtures.mjs';
import { page as localPage, replay as localReplay } from './fixtures.mjs';

for (const c of cases) test(`local/demo/CI workload ${c.id} matches both Cheerio parsers`, () => {
  assert.equal(page, localPage);
  assert.equal(transform, localReplay);
  const source = caseSource(c), output = caseReplay(load, source, c);
  assert.equal(caseReplay(slimLoad, source, c), output);
  const $ = load(output, { xml: Boolean(c.kind) });
  const values = (selector, read) => $(selector).get().map(node => read($(node)));
  const repeated = value => Array(c.rows).fill(value);
  if (c.kind) {
    assert.equal(source, (c.kind === 'xml' ? localXML.page : localXML.svg)(c.rows));
    assert.equal(output, localXML.replay(load, source));
    if (c.kind === 'xml') {
      assert.match(output, /processed="yes"/);
      assert.match(output, /<loc>\.\/extra.xml<\/loc>/);
      assert(!output.includes('<priority>'));
      assert.equal($('url').length, c.rows + 1);
      assert.deepEqual(values('url[processed="yes"] > loc', node => node.text()),
        Array.from({ length: c.rows }, (_, i) => `./docs/${i}?a=1&b=2`));
      assert.deepEqual(values('lastmod', node => node.text()), repeated('2026-02-01'));
    } else {
      assert.match(output, /xlink:href="#g0-local"/);
      assert.match(output, /<metadata>processed<\/metadata>/);
      assert(!output.includes('<title>'));
      assert.equal($('linearGradient').attr('gradientUnits'), 'userSpaceOnUse');
      assert.equal($('svg').attr('aria-label'), 'offline');
      assert.deepEqual(values('use', node => node.attr('xlink:href')),
        Array.from({ length: c.rows }, (_, i) => `#g${i}-local`));
      assert.deepEqual(values('path', node => node.attr('stroke-width')), repeated('2'));
    }
  } else {
    assert.match(output, /<footer>Done<\/footer>/);
    assert.match(output, /href="\/offline\/page\/0"/);
    assert(!output.includes('obsolete'));
    assert.equal($('article').length, c.rows);
    assert.deepEqual(values('a', node => [node.attr('href'), node.attr('data-order'), node.attr('rel')]),
      Array.from({ length: c.rows }, (_, i) => [`/offline/page/${i}`, String(i), 'local']));
    assert.deepEqual(values('img', node => [node.attr('loading'), node.attr('decoding')]),
      Array.from({ length: c.rows }, () => ['lazy', 'async']));
    assert.deepEqual(values('h2', node => node.attr('data-heading')), repeated('yes'));
    assert.deepEqual(values('.example', node => node.html()),
      Array.from({ length: c.rows }, (_, i) => `<p>Example ${i}</p>`));
  }
});

test('all four cases share one deadline and retain their paired blocks', async () => {
  let clock = 0;
  const selectedCases = cases.map(c => ({ ...c, rows: 1 }));
  const result = await compare([{ name: 'A', load }, { name: 'B', load: slimLoad }],
    { durationMs: 600, now: () => clock++, probe: () => 1, warmups: 1, iterations: 1, selectedCases });
  assert(result.sufficient);
  assert(result.elapsedMs < 610);
  assert.deepEqual(result.results.map(r => r.case), cases.map(c => c.id));
  assert(result.results.every(r => r.raw.blocks >= 3));
});

test('shared deadline retains incomplete blocks and balances both opposite-order halves', async () => {
  let clock = 0;
  const calls = [];
  const open = name => source => { calls.push(name); return load(source); };
  const result = await compare([{ name: 'A', load: open('A') }, { name: 'B', load: open('B') }],
    { durationMs: 155, now: () => clock++, probe: () => 1, warmups: 1, iterations: 1,
      selectedCases: [{ id: 'tiny', rows: 1 }] });
  assert(result.sufficient);
  assert(result.elapsedMs < 165);
  const blocks = result.results[0].blocks;
  assert(blocks.some(b => !b.complete));
  assert.equal(blocks[0].order, 'ABBA/BAAB');
  assert.equal(blocks[1].order, 'BAAB/ABBA');
  assert.deepEqual(calls.slice(3, 19), [...'ABBABAABBAABABBA']);
  assert.equal(result.results[0].raw.blocks, blocks.filter(b => b.complete).length);
});

test('only independent probe spread filters whole blocks; raw ratios and order are retained', () => {
  const result = summarize([
    { complete: true, accepted: true, speedup: 0.5, milliseconds: [[2, 2, 2, 2], [1, 1, 1, 1]], order: 'ABBA/BAAB' },
    { complete: true, accepted: false, speedup: 10, milliseconds: [[1, 1, 1, 1], [10, 10, 10, 10]], order: 'BAAB/ABBA' },
    { complete: false, accepted: false },
  ]);
  assert.equal(result.raw.pairedSpeedup, 5.25);
  assert.equal(result.filtered.pairedSpeedup, 0.5);
  assert.equal(result.byOrder['BAAB/ABBA'].pairedSpeedup, 10);
});

test('mismatched reference cancels timing and still disposes the document', async () => {
  let disposed = 0, clock = 0;
  const badLoad = source => {
    const $ = load(source);
    $.html = () => 'wrong';
    $.dispose = () => disposed++;
    return $;
  };
  await assert.rejects(compare([{ name: 'good', load }, { name: 'bad', load: badLoad }],
    { durationMs: 100, now: () => clock++, probe: () => 1, warmups: 1,
      selectedCases: [{ id: 'tiny', rows: 1 }] }), /output mismatch/);
  assert.equal(disposed, 1);
});

test('exhausted warmup budget fails instead of claiming a comparison', async () => {
  let clock = 0;
  await assert.rejects(compare([{ name: 'a', load }, { name: 'b', load }],
    { durationMs: 1, now: () => clock++ }), /exhausted during warmup/);
});

for (const [name, selectedCases] of [
  ['empty', []],
  ['duplicate IDs', [{ id: 'same', rows: 1 }, { id: 'same', rows: 2 }]],
  ['empty ID', [{ id: '', rows: 1 }]],
]) test(`benchmark rejects ${name} cases before loading documents`, async () => {
  let clock = 0, opened = 0;
  const open = source => { opened++; return load(source); };
  await assert.rejects(compare([{ name: 'A', load: open }, { name: 'B', load: open }],
    { durationMs: 100, now: () => clock++, probe: () => 1, warmups: 1, iterations: 1, selectedCases }), /cases/i);
  assert.equal(opened, 0);
});

for (const elapsed of [0, -1, NaN, Infinity])
  test(`benchmark rejects invalid sample duration ${elapsed}`, async () => {
    let clock = 0, forced = null, probes = 0;
    const now = () => {
      if (forced !== null) { const value = forced; forced = null; return value; }
      return ++clock;
    };
    const open = source => {
      const $ = load(source);
      if (probes >= 30) forced = clock + elapsed;
      return $;
    };
    await assert.rejects(compare([{ name: 'A', load: open }, { name: 'B', load: open }],
      { durationMs: 250, now, probe: () => { probes++; return 1; }, warmups: 1, iterations: 1,
        selectedCases: [{ id: 'tiny', rows: 1 }] }), /sample duration/i);
  });

for (const maximum of [1.5, 1.500001, 0, -1, NaN, Infinity])
  test(`probe filter handles boundary or invalid reading ${maximum}`, async () => {
    let clock = 0, probes = 0;
    const result = await compare([{ name: 'A', load }, { name: 'B', load }],
      { durationMs: 250, now: () => clock++,
        probe: () => ++probes > 30 && probes % 10 === 0 ? maximum : 1,
        warmups: 1, iterations: 1, selectedCases: [{ id: 'tiny', rows: 1 }] });
    const panel = result.results[0], complete = panel.blocks.filter(block => block.complete);
    assert(result.sufficient);
    assert.equal(panel.raw.blocks, complete.length);
    assert.equal(panel.filtered.blocks, maximum === 1.5 ? complete.length : 0);
    assert(complete.every(block => block.probes.length === 10));
    assert(panel.blocks.some(block => !block.complete), 'Keep the interrupted final block');
  });

test('paired ratios preserve their direction and are not normalized by the control', async () => {
  let clock = 0;
  const open = cost => (source, options) => { clock += cost; return load(source, options); };
  const result = await compare([
    { name: 'current', load: open(2) }, { name: 'reference', load: open(6) },
    { name: 'control', load: open(4), control: true },
  ], { durationMs: 600, now: () => clock, probe: () => { clock++; return 1; },
    warmups: 1, iterations: 2, selectedCases: [{ id: 'tiny', rows: 1 }] });
  assert(result.sufficient);
  for (const [index, ratio] of [3, 2].entries()) {
    const panel = result.results[index];
    assert.equal(panel.control, index === 1);
    assert.equal(panel.raw.pairedSpeedup, ratio);
    assert.equal(panel.filtered.pairedSpeedup, ratio);
    assert.deepEqual(panel.raw.milliseconds, [2, ratio * 2]);
    for (const order of Object.values(panel.byOrder)) assert.equal(order.pairedSpeedup, ratio);
  }
});

test('a changed first output within a timed batch cancels the comparison and disposes every document', async () => {
  let clock = 0, opened = 0, disposed = 0, referenceCalls = 0;
  const open = source => {
    opened++;
    const $ = load(source);
    $.dispose = () => disposed++;
    return $;
  };
  const reference = source => {
    const $ = open(source);
    // The warmup and second output in this batch agree; the first output differs.
    if (++referenceCalls === 2) $.html = () => 'changed';
    return $;
  };
  await assert.rejects(compare([{ name: 'current', load: open }, { name: 'reference', load: reference }],
    { durationMs: 250, now: () => clock++, probe: () => 1, warmups: 1, iterations: 2,
      selectedCases: [{ id: 'tiny', rows: 1 }] }), /output changed during timing/);
  assert.equal(referenceCalls, 3);
  assert.equal(disposed, opened);
});

for (const kind of [undefined, 'xml', 'svg'])
  test(`benchmark ${kind ?? 'html'} replay disposes after a serialization failure`, () => {
    let disposed = 0;
    const sentinel = new Error('serialization sentinel'), item = { id: 'failure', kind, rows: 1 };
    const open = (source, options) => {
      const $ = load(source, options);
      $[kind ? 'xml' : 'html'] = () => { throw sentinel; };
      $.dispose = () => disposed++;
      return $;
    };
    assert.throws(() => caseReplay(open, caseSource(item), item), error => error === sentinel);
    assert.equal(disposed, 1);
  });
