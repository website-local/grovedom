// A private manifest supplies local HTML files; paths and content are not emitted.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { load } from '../diagnostics/index.js';
import { kernel } from '../diagnostics/kernel.js';

const manifest = JSON.parse(readFileSync(process.env.GROVEDOM_HTML_MANIFEST, 'utf8'));
const rounds = Number(process.env.GROVEDOM_BENCH_ROUNDS ?? 7);
const iterations = Number(process.env.GROVEDOM_BENCH_ITERATIONS ?? 20);
const median = values => values.toSorted((a, b) => a - b)[values.length >> 1];
const pages = [];
const parseOnly = process.env.GROVEDOM_HEAP_WORKLOAD === 'parse';
for (const { id, path } of manifest) {
  const html = readFileSync(path, 'utf8');
  const digest = createHash('sha256').update(html).digest('hex');
  let capacity = 0, checksum = 0;
  const cycle = () => {
    if (parseOnly) { capacity = Math.max(capacity, kernel.profileParse(html)); return; }
    const $ = load(html);
    try {
      $('a[href]').attr('data-measurement', 'yes');
      checksum ^= $.html().length;
      capacity = Math.max(capacity, kernel.stats().memoryBytes ?? 0);
    } finally { $.dispose(); }
  };
  kernel.trim?.();
  const initial = kernel.growthStats?.();
  const coldStart = performance.now();
  try { cycle(); }
  catch (error) { pages.push({ id, bytes: Buffer.byteLength(html), digest, excluded: error.code ?? error.message }); continue; }
  const coldMilliseconds = performance.now() - coldStart;
  const coldGrowth = kernel.growthStats?.();
  for (let i = 0; i < 10; i++) cycle();
  const samples = [], growthSamples = [], growthCalls = [];
  for (let round = 0; round < rounds; round++) {
    const before = kernel.growthStats?.();
    const start = performance.now();
    for (let i = 0; i < iterations; i++) cycle();
    samples.push((performance.now() - start) / iterations);
    const after = kernel.growthStats?.();
    growthSamples.push(before ? (after.milliseconds - before.milliseconds) / iterations : 0);
    growthCalls.push(before ? (after.calls - before.calls) / iterations : 0);
  }
  pages.push({ id, bytes: Buffer.byteLength(html), characters: html.length, digest, capacity, checksum,
    coldMilliseconds, coldGrowthMilliseconds: initial ? coldGrowth.milliseconds - initial.milliseconds : 0,
    coldGrowthCalls: initial ? coldGrowth.calls - initial.calls : 0,
    medianMilliseconds: median(samples), medianGrowthMilliseconds: median(growthSamples),
    medianGrowthCalls: median(growthCalls), samples });
}
console.log(JSON.stringify({ scope: parseOnly ? 'parse and explicit disposal, including templates; diagnostic only, not facade compatibility evidence' : 'parse, select, attribute write, serialize, explicit disposal; not the engine replay',
  backend: process.env.GROVEDOM_BACKEND ?? 'wasm', heap: process.env.GROVEDOM_WASM_HEAP,
  initialPages: kernel.configuration?.initialPages, pages }, null, 2));
