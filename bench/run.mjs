import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createRequire } from 'node:module';
import { load as parse5 } from 'cheerio';
import { load as htmlparser2 } from 'cheerio/slim';
import { load } from '../diagnostics/index.js';
import { kernel } from '../diagnostics/kernel.js';
import { page, replay } from '../test/fixtures.mjs';

const require = createRequire(import.meta.url);
const rounds = Number(process.env.GROVEDOM_BENCH_ROUNDS ?? 9);
const iterations = Number(process.env.GROVEDOM_BENCH_ITERATIONS ?? 30);
const rows = Number(process.env.GROVEDOM_BENCH_ROWS ?? 120);
for (const value of [rounds, iterations, rows]) if (!Number.isSafeInteger(value) || value < 1) throw new Error('Benchmark sizes must be positive integers.');
const source = page(rows);
const cases = [
  { name: 'cheerio/parse5', load: parse5 },
  { name: 'cheerio/parse5-explicit-defaults', load: input => parse5(input, { sourceCodeLocationInfo: false }) },
  { name: 'cheerio/htmlparser2', load: input => htmlparser2(input, { xmlMode: false, decodeEntities: true }) },
  { name: 'grovedom/direct', load: input => load(input, { execution: 'direct' }) },
  { name: 'grovedom/buffered', load },
];
const expected = replay(parse5, source);
// Compare required exact output first. Keep timings of incompatible baselines
// visible as diagnostics, never silently turn them into adoption evidence.
for (const item of cases) {
  item.compatible = replay(item.load, source) === expected;
  item.samples = [];
  for (let i = 0; i < 15; i++) replay(item.load, source);
}
let consumed = 0;
for (let round = 0; round < rounds; round++) {
  // Rotate order to reduce bias from warm-up, thermal drift, and background work.
  for (let offset = 0; offset < cases.length; offset++) {
    const item = cases[(round + offset) % cases.length];
    const start = performance.now();
    for (let i = 0; i < iterations; i++) consumed += replay(item.load, source).length;
    item.samples.push((performance.now() - start) / iterations);
  }
}
assert.equal(kernel.stats().liveDocuments, 0);
assert.equal(kernel.stats().liveBytes, 0);
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const baseline = median(cases[0].samples);
const memory = process.memoryUsage();
console.log(JSON.stringify({
  scope: 'authored DOM replay; not the full engine/MDN adoption gate',
  backend: process.env.GROVEDOM_BACKEND ?? 'wasm',
  wasmHeap: (process.env.GROVEDOM_BACKEND ?? 'wasm') === 'wasm' ? process.env.GROVEDOM_WASM_HEAP ?? 'pool' : undefined,
  versions: { node: process.versions.node, cheerio: require('cheerio/package.json').version },
  rows, inputBytes: Buffer.byteLength(source), rounds, iterations, consumed,
  cases: cases.map(item => ({ name: item.name, exactOutput: item.compatible,
    medianMs: median(item.samples), speedupVsCurrent: baseline / median(item.samples), samplesMs: item.samples })),
  nativeAllocator: kernel.stats(),
  processMemory: { rss: memory.rss, heapUsed: memory.heapUsed, external: memory.external },
  memoryScope: 'one mixed-process end sample; not per-backend memory or fragmentation evidence',
}, null, 2));
