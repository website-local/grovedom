// Keep each implementation in its own fresh process to avoid mixing facade
// shapes and GC lifetimes. Exclude startup/warmup; preserve every timed batch.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const manifest = JSON.parse(readFileSync(process.env.GROVEDOM_AB_MANIFEST, 'utf8'));
const reference = manifest.normalizeHTML ? await import('cheerio') : null;
function normalized(output) {
  if (!reference) return output;
  const value = JSON.parse(output);
  for (const item of value.outputs) item[1] = reference.load(item[1]).html();
  return JSON.stringify(value);
}
if (!Array.isArray(manifest.variants) || manifest.variants.length < 2) throw new Error('Expected at least two isolated source/artifact variants.');
if (new Set(manifest.variants.map(v => v.name)).size !== manifest.variants.length) throw new Error('Variant names must be unique.');
const rows = Number(process.env.GROVEDOM_BENCH_ROWS ?? 120);
const blocks = Number(process.env.GROVEDOM_BENCH_BLOCKS ?? 3);
const batches = Number(process.env.GROVEDOM_BENCH_ROUNDS ?? 30);
const iterations = Number(process.env.GROVEDOM_BENCH_ITERATIONS ?? 12);
const warmups = Number(process.env.GROVEDOM_BENCH_WARMUPS ?? 400);
const quietAffinity = process.env.GROVEDOM_BENCH_AFFINITY === 'quiet';
if (quietAffinity && process.platform !== 'linux') throw new Error('Quiet CPU selection requires Linux /proc and taskset.');
async function quietCPU() {
  const allowed = new Set();
  for (const part of readFileSync('/proc/self/status', 'utf8').match(/^Cpus_allowed_list:\s*(.+)$/m)[1].split(',')) {
    const [lo, hi = lo] = part.split('-').map(Number);
    for (let i = lo; i <= hi; i++) allowed.add(i);
  }
  function sample() {
    return readFileSync('/proc/stat', 'utf8').split('\n').filter(line => /^cpu\d+ /.test(line)).map(line => {
      const [label, ...values] = line.trim().split(/\s+/), v = values.map(Number);
      return { cpu: Number(label.slice(3)), total: v.slice(0, 8).reduce((a, b) => a + b, 0), idle: v[3] + v[4] };
    });
  }
  const before = sample();
  await new Promise(resolve => setTimeout(resolve, 1000));
  const ranked = sample().map((v, i) => ({ cpu: v.cpu, busy: 1 - (v.idle - before[i].idle) / (v.total - before[i].total) }))
    .filter(v => allowed.has(v.cpu) && Number.isFinite(v.busy)).sort((a, b) => a.busy - b.busy);
  if (!ranked.length) throw new Error('No permitted CPU with an activity sample.');
  return ranked[0].cpu;
}
for (const value of [rows, blocks, batches, iterations, warmups]) if (!Number.isSafeInteger(value) || value < 1) throw new Error('Expected positive benchmark counts.');
const median = values => {
  const sorted = values.toSorted((a, b) => a - b);
  return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
};
const child = `
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const importStart = performance.now();
const facade = await import(process.env.GROVEDOM_PROCESS_ENTRY);
const { load } = facade;
const importMilliseconds = performance.now() - importStart;
const config = JSON.parse(process.env.GROVEDOM_PROCESS_CONFIG);
if (config.options !== undefined) await facade.init(config.options);
const inputs = [];
for (const item of config.corpus) {
  const { page, replay } = await import(item.workload ? pathToFileURL(item.workload).href : process.env.GROVEDOM_PROCESS_FIXTURE);
  const source = item.path ? readFileSync(item.path, 'utf8') : page(item.rows ?? config.rows);
  inputs.push({ source, replay, scenario: item });
}
const corpus = inputs.map(({ source, scenario }) => ({ id: scenario.id,
  bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') }));
const expected = [];
const firstStart = performance.now();
for (const { source, replay, scenario } of inputs) expected.push(config.consumer ? await replay(source, scenario) : replay(load, source));
const firstCorpusMilliseconds = performance.now() - firstStart;
const invoke = config.consumer ? async () => {
  let length = 0;
  for (const { source, replay, scenario } of inputs) length += (await replay(source, scenario)).length;
  return length;
} : () => {
  let length = 0;
  for (const { source, replay } of inputs) length += replay(load, source).length;
  return length;
};
let consumed = 0;
for (let i = 0; i < config.warmups; i++) consumed += config.consumer ? await invoke() : invoke();
const samples = [];
let probeSink = 0;
function probe() {
  const start = performance.now();
  for (let i = 0; i < 3000000; i++) probeSink = (Math.imul(probeSink ^ i, 1664525) + 1013904223) | 0;
  return performance.now() - start;
}
const controls = [];
for (let i = 0; i < 30; i++) probe();
for (let batch = 0; batch < config.batches; batch++) {
  await new Promise(setImmediate);
  const before = probe();
  const start = performance.now();
  for (let i = 0; i < config.iterations; i++) consumed += config.consumer ? await invoke() : invoke();
  samples.push((performance.now() - start) / config.iterations);
  controls.push([before, probe()]);
}
console.log(JSON.stringify({ expected, corpus, consumed, samples, controls, probeSink, importMilliseconds, firstCorpusMilliseconds }));
`;
const results = [];
const corpus = manifest.corpus ?? [{ id: 'authored' }];
if (!corpus.length) throw new Error('Expected a nonempty corpus.');
for (const item of manifest.aggregate ? [{ id: 'corpus' }] : corpus) {
  const samples = [], paired = [];
  let expected, inputs;
  for (let block = 0; block < blocks; block++) {
    // Select independently of implementation timings. Every variant runs twice
    // in mirrored order on the same CPU; rotate the first position per block.
    const cpu = quietAffinity ? await quietCPU() : null;
    const forward = manifest.variants.map((_, index) => (index + block) % manifest.variants.length);
    const order = [...forward, ...forward.toReversed()], milliseconds = manifest.variants.map(() => []);
    for (const index of order) {
      const variant = manifest.variants[index];
      const args = ['--input-type=module', '-e', child];
      const output = spawnSync(quietAffinity ? 'taskset' : process.execPath, quietAffinity ? ['-c', String(cpu), process.execPath, ...args] : args, {
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, ...variant.env,
          GROVEDOM_PROCESS_ENTRY: pathToFileURL(variant.entry).href,
          GROVEDOM_REPLAY_ENTRY: variant.entry,
          GROVEDOM_PROCESS_FIXTURE: manifest.workload ? pathToFileURL(manifest.workload).href : new URL('../test/fixtures.mjs', import.meta.url).href,
          GROVEDOM_PROCESS_CONFIG: JSON.stringify({ rows, batches, iterations, warmups, options: variant.options, consumer: manifest.consumer, corpus: manifest.aggregate ? corpus : [item] }),
        },
      });
      if (output.error) throw output.error;
      assert.equal(output.status, 0, output.stderr);
      const report = JSON.parse(output.stdout);
      const rendered = report.expected.map(normalized);
      expected ??= rendered;
      inputs ??= report.corpus;
      assert.deepEqual(report.corpus, inputs, 'Input corpus differs between variants');
      assert.deepEqual(rendered, expected, `${item.id}: ${variant.name}`);
      delete report.expected;
      delete report.corpus;
      const time = median(report.samples);
      milliseconds[index].push(time);
      samples.push({ block, variant: variant.name, medianMilliseconds: time, ...report });
    }
    const total = values => values.reduce((a, b) => a + b, 0);
    const probes = samples.filter(sample => sample.block === block).flatMap(sample => sample.controls.flat());
    paired.push({ order: manifest.variants.length === 2 ? (block % 2 ? 'BAAB' : 'ABBA') : order.map(i => manifest.variants[i].name),
      milliseconds, accepted: Math.max(...probes) / Math.min(...probes) <= 1.5,
      speedup: total(milliseconds[0]) / total(milliseconds[1]) });
  }
  const accepted = paired.filter(b => b.accepted);
  const comparisons = [];
  for (let a = 0; a < manifest.variants.length; a++) for (let b = a + 1; b < manifest.variants.length; b++) {
    const ratio = block => median(block.milliseconds[a]) / median(block.milliseconds[b]);
    comparisons.push({ baseline: manifest.variants[a].name, candidate: manifest.variants[b].name,
      medianPairedSpeedup: median(paired.map(ratio)), filteredSpeedup: accepted.length ? median(accepted.map(ratio)) : null,
      minimumRetained: accepted.length ? Math.min(...accepted.map(ratio)) : null,
      maximumRetained: accepted.length ? Math.max(...accepted.map(ratio)) : null });
  }
  results.push({ id: item.id, corpus: inputs, medianPairedSpeedup: median(paired.map(b => b.speedup)), filteredSpeedup: accepted.length ? median(accepted.map(b => b.speedup)) : null, acceptedBlocks: accepted.length, comparisons, paired, samples });
}
console.log(JSON.stringify({ scope: manifest.consumer ? 'isolated engine/MDN transform replay with deterministic resource I/O; includes adapter disposal and URL/async overhead; excludes startup/warmup and network/disk' : 'one variant per fresh process; excludes startup and warmup; not the full engine workload',
  filterPolicy: 'All raw samples retained. Filter complete mirrored process blocks only when max/min independent CPU probes exceeds 1.5; never filter by implementation timings or speedup.',
  affinityPolicy: quietAffinity ? 'Choose a permitted CPU by independent activity before each block; pin all processes of the block to it.' : 'Inherit process affinity.',
  orderPolicy: 'Rotate the first variant by block, then run the reverse order. Use a multiple of the variant count for equal position coverage. Two variants retain ABBA/BAAB ordering.',
  startupScope: 'Diagnostic import and first-corpus wall times in each fresh process; input preparation and process startup excluded, no noise-filtered startup claim.',
  outputComparison: manifest.normalizeHTML ? 'HTML reparsed through Cheerio/parse5 outside timing; resource events compared exactly' : 'exact output',
  aggregation: manifest.aggregate ? 'Each timed iteration executes the entire listed corpus in order, once per entry; ratios use total elapsed time, not averages of per-case speedups.' : 'Each corpus entry is timed separately.',
  node: process.versions.node, rows, blocks, batches, iterations, warmups,
  variants: manifest.variants.map(v => v.name), results }, null, 2));
