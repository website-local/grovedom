// Keep each implementation in its own fresh process to avoid mixing facade
// shapes and GC lifetimes. Exclude startup/warmup; preserve every timed batch.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const manifest = JSON.parse(readFileSync(process.env.GROVEDOM_AB_MANIFEST, 'utf8'));
if (manifest.variants?.length !== 2) throw new Error('Expected two isolated source/artifact variants.');
const rows = Number(process.env.GROVEDOM_BENCH_ROWS ?? 120);
const blocks = Number(process.env.GROVEDOM_BENCH_BLOCKS ?? 3);
const batches = Number(process.env.GROVEDOM_BENCH_ROUNDS ?? 30);
const iterations = Number(process.env.GROVEDOM_BENCH_ITERATIONS ?? 12);
const warmups = Number(process.env.GROVEDOM_BENCH_WARMUPS ?? 400);
for (const value of [rows, blocks, batches, iterations, warmups]) if (!Number.isSafeInteger(value) || value < 1) throw new Error('Expected positive benchmark counts.');
const median = values => {
  const sorted = values.toSorted((a, b) => a - b);
  return (sorted[(sorted.length - 1) >> 1] + sorted[sorted.length >> 1]) / 2;
};
const child = `
import { performance } from 'node:perf_hooks';
import { readFileSync } from 'node:fs';
const { load } = await import(process.env.GROVEDOM_PROCESS_ENTRY);
const { page, replay } = await import(process.env.GROVEDOM_PROCESS_FIXTURE);
const config = JSON.parse(process.env.GROVEDOM_PROCESS_CONFIG);
const source = config.path ? readFileSync(config.path, 'utf8') : page(config.rows);
const expected = replay(load, source);
let consumed = 0;
for (let i = 0; i < config.warmups; i++) consumed += replay(load, source).length;
const samples = [];
for (let batch = 0; batch < config.batches; batch++) {
  await new Promise(setImmediate);
  const start = performance.now();
  for (let i = 0; i < config.iterations; i++) consumed += replay(load, source).length;
  samples.push((performance.now() - start) / config.iterations);
}
console.log(JSON.stringify({ expected, consumed, samples }));
`;
const results = [];
for (const item of manifest.corpus ?? [{ id: 'authored' }]) {
  const samples = [], paired = [];
  let expected;
  for (let block = 0; block < blocks; block++) {
    const order = block % 2 ? [1, 0, 0, 1] : [0, 1, 1, 0], milliseconds = [[], []];
    for (const index of order) {
      const variant = manifest.variants[index];
      const output = spawnSync(process.execPath, ['--input-type=module', '-e', child], {
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, ...variant.env,
          GROVEDOM_PROCESS_ENTRY: pathToFileURL(variant.entry).href,
          GROVEDOM_PROCESS_FIXTURE: new URL('../test/fixtures.mjs', import.meta.url).href,
          GROVEDOM_PROCESS_CONFIG: JSON.stringify({ rows, batches, iterations, warmups, path: item.path }),
        },
      });
      if (output.error) throw output.error;
      assert.equal(output.status, 0, output.stderr);
      const report = JSON.parse(output.stdout);
      expected ??= report.expected;
      assert.equal(report.expected, expected, `${item.id}: ${variant.name}`);
      delete report.expected;
      const time = median(report.samples);
      milliseconds[index].push(time);
      samples.push({ block, variant: variant.name, medianMilliseconds: time, ...report });
    }
    const total = values => values.reduce((a, b) => a + b, 0);
    paired.push({ order: block % 2 ? 'BAAB' : 'ABBA', milliseconds,
      speedup: total(milliseconds[0]) / total(milliseconds[1]) });
  }
  results.push({ id: item.id, medianPairedSpeedup: median(paired.map(b => b.speedup)), paired, samples });
}
console.log(JSON.stringify({ scope: 'one variant per fresh process; excludes startup and warmup; all batches retained without filtering; not the full engine workload',
  node: process.versions.node, rows, blocks, batches, iterations, warmups,
  variants: manifest.variants.map(v => v.name), results }, null, 2));
