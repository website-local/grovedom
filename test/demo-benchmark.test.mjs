import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from 'cheerio';
import { load as slimLoad } from 'cheerio/slim';
import { compare, summarize } from '../demo/comparison.js';
import { cases, page, transform } from '../demo/workload.js';
import { page as localPage, replay as localReplay } from './fixtures.mjs';

for (const c of cases) test(`local/demo/CI workload ${c.id} matches both Cheerio parsers`, () => {
  assert.equal(page, localPage);
  assert.equal(transform, localReplay);
  const output = transform(load, page(c.rows));
  assert.equal(transform(slimLoad, page(c.rows)), output);
  assert.match(output, /<footer>Done<\/footer>/);
  assert.match(output, /href="\/offline\/page\/0"/);
  assert(!output.includes('obsolete'));
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
