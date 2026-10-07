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
  if (c.kind) {
    assert.equal(source, (c.kind === 'xml' ? localXML.page : localXML.svg)(c.rows));
    assert.equal(output, localXML.replay(load, source));
    if (c.kind === 'xml') {
      assert.match(output, /processed="yes"/);
      assert.match(output, /<loc>\.\/extra.xml<\/loc>/);
      assert(!output.includes('<priority>'));
    } else {
      assert.match(output, /xlink:href="#g0-local"/);
      assert.match(output, /<metadata>processed<\/metadata>/);
      assert(!output.includes('<title>'));
    }
  } else {
    assert.match(output, /<footer>Done<\/footer>/);
    assert.match(output, /href="\/offline\/page\/0"/);
    assert(!output.includes('obsolete'));
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
  let disposed = 0;
  const badLoad = source => {
    const $ = load(source);
    $.html = () => 'wrong';
    $.dispose = () => disposed++;
    return $;
  };
  await assert.rejects(compare([{ name: 'good', load }, { name: 'bad', load: badLoad }],
    { durationMs: 100, warmups: 1, selectedCases: [{ id: 'tiny', rows: 1 }] }), /output mismatch/);
  assert.equal(disposed, 1);
});

test('exhausted warmup budget fails instead of claiming a comparison', async () => {
  let clock = 0;
  await assert.rejects(compare([{ name: 'a', load }, { name: 'b', load }],
    { durationMs: 1, now: () => clock++ }), /exhausted during warmup/);
});
