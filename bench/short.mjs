// Short paired release measurements. The filter observes only a separate CPU
// probe, never the candidate timings or their ratio. Preserve every raw block.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import * as authored from '../test/fixtures.mjs';

const manifest = JSON.parse(readFileSync(process.env.GROVEDOM_AB_MANIFEST, 'utf8'));
const { page, replay } = manifest.workload ? await import(pathToFileURL(manifest.workload).href) : authored;
if (manifest.variants?.length !== 2) throw new Error('Expected exactly two isolated source/artifact variants.');
const rounds = Number(process.env.GROVEDOM_BENCH_ROUNDS ?? 60);
const iterations = Number(process.env.GROVEDOM_BENCH_ITERATIONS ?? 12);
const rows = Number(process.env.GROVEDOM_BENCH_ROWS ?? 120);
for (const value of [rounds, iterations, rows]) if (!Number.isSafeInteger(value) || value < 1) throw new Error('Expected positive benchmark counts.');
const variants = [];
for (const config of manifest.variants) {
  Object.assign(process.env, config.env);
  const facade = await import(pathToFileURL(config.entry).href);
  if (config.options !== undefined) facade.init(config.options);
  const { load } = facade;
  variants.push({ name: config.name, load });
}
const corpus = manifest.corpus?.map(({ id, path }) => ({ id, source: readFileSync(path, 'utf8') }))
  ?? [{ id: 'authored', source: page(rows) }];
const quantile = (values, fraction) => {
  const sorted = values.toSorted((a, b) => a - b), position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position), upper = Math.ceil(position);
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
};

let probeSink = 0, consumed = 0;
function probe() {
  let value = probeSink;
  const start = performance.now();
  for (let i = 0; i < 3000000; i++) value = (Math.imul(value ^ i, 1664525) + 1013904223) | 0;
  const elapsed = performance.now() - start;
  probeSink = value;
  return elapsed;
}
function measure(load, source) {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) consumed += replay(load, source).length;
  return (performance.now() - start) / iterations;
}
function summarize(blocks) {
  if (!blocks.length) return null;
  const total = values => values.reduce((sum, value) => sum + value, 0);
  const ratio = block => total(block.milliseconds[0]) / total(block.milliseconds[1]);
  const ratios = blocks.map(ratio);
  return { blocks: blocks.length, medianPairedSpeedup: quantile(ratios, 0.5),
    pairedP10: quantile(ratios, 0.1), pairedP90: quantile(ratios, 0.9),
    medianMilliseconds: variants.map((_, i) => quantile(blocks.map(b => total(b.milliseconds[i]) / 4), 0.5)),
    byOrder: Object.fromEntries(['ABBA/BAAB', 'BAAB/ABBA'].map(order => {
      const values = blocks.filter(b => b.order === order).map(ratio);
      return [order, { blocks: values.length, medianPairedSpeedup: values.length ? quantile(values, 0.5) : null }];
    })),
  };
}

const results = [];
for (const { id, source } of corpus) {
  const expected = replay(variants[0].load, source);
  for (const variant of variants) assert.equal(replay(variant.load, source), expected, `${id}: ${variant.name}`);
  for (let i = 0; i < 200; i++) for (const variant of variants) consumed += replay(variant.load, source).length;
  for (let i = 0; i < 30; i++) probe();
  const calibration = Array.from({ length: 31 }, probe);
  // Compare probes within a block, not against an absolute calibration cutoff:
  // a steady change in probe speed is not evidence of an interrupted batch.
  const blocks = [];
  for (let round = 0; round < rounds; round++) {
    const milliseconds = [[], []], controls = [];
    // Keep both opposite-order halves together. The first batch after a yield
    // can be slower even for identical code; each variant gets that position.
    for (let half = 0; half < 2; half++) {
      await new Promise(setImmediate);
      const order = (round + half) % 2 ? [1, 0, 0, 1] : [0, 1, 1, 0];
      controls.push(probe());
      for (const index of order) {
        milliseconds[index].push(measure(variants[index].load, source));
        controls.push(probe());
      }
    }
    const reasons = [];
    if (Math.max(...controls) / Math.min(...controls) > 1.5) reasons.push('unstable-control');
    blocks.push({ round, order: round % 2 ? 'BAAB/ABBA' : 'ABBA/BAAB', milliseconds, controls,
      accepted: reasons.length === 0, reasons });
  }
  const accepted = blocks.filter(block => block.accepted);
  results.push({ id, inputBytes: Buffer.byteLength(source), calibrationMilliseconds: calibration,
    filter: { maximumControlSpread: 1.5 },
    unfiltered: summarize(blocks), filtered: summarize(accepted),
    rejectedBlocks: blocks.length - accepted.length,
    blocks });
}
console.log(JSON.stringify({ scope: 'short ABBA/BAAB release replay; raw and control-filtered samples; not the full engine workload',
  node: process.versions.node, variants: variants.map(v => v.name), rounds, iterations, consumed, probeSink,
  filterPolicy: 'Reject whole balanced blocks only if max/min CPU-probe time exceeds 1.5. Candidate wall times, GC and ratios do not select samples. Steady host load is not detected.',
  results }, null, 2));
