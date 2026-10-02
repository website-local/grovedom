// Entries must be isolated source snapshots so imports bind to each variant's
// kernel. The private manifest contains machine paths; reports contain labels.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { page, replay } from '../test/fixtures.mjs';
const manifest = JSON.parse(readFileSync(process.env.GROVEDOM_AB_MANIFEST, 'utf8'));
const rounds = Number(process.env.GROVEDOM_BENCH_ROUNDS ?? 11);
const iterations = Number(process.env.GROVEDOM_BENCH_ITERATIONS ?? 60);
for (const value of [rounds, iterations]) if (!Number.isSafeInteger(value) || value < 1) throw new Error('Expected positive benchmark counts.');
const variants = [];
for (const config of manifest.variants) {
  Object.assign(process.env, config.env);
  const { load } = await import(pathToFileURL(config.entry).href);
  variants.push({ name: config.name, load, samples: [] });
}
const corpus = manifest.corpus?.map(({ id, path }) => ({ id, source: readFileSync(path, 'utf8') })) ?? [
  { id: 'authored', source: page(Number(process.env.GROVEDOM_BENCH_ROWS ?? 120)) },
];
let checksum = 0;
const results = [];
const median = values => values.toSorted((a, b) => a - b)[values.length >> 1];
for (const { id, source } of corpus) {
  const expected = replay(variants[0].load, source);
  for (const variant of variants) {
    assert.equal(replay(variant.load, source), expected, `${id}: ${variant.name}`);
    variant.samples = [];
    for (let i = 0; i < 80; i++) replay(variant.load, source);
  }
  for (let round = 0; round < rounds; round++) {
    for (let offset = 0; offset < variants.length; offset++) {
      const variant = variants[(round + offset) % variants.length];
      const start = performance.now();
      for (let i = 0; i < iterations; i++) checksum += replay(variant.load, source).length;
      variant.samples.push((performance.now() - start) / iterations);
    }
  }
  results.push({ id, inputBytes: Buffer.byteLength(source), variants: variants.map(v => ({ name: v.name,
    medianMilliseconds: median(v.samples), medianPairedSpeedup: median(v.samples.map((ms, i) => variants[0].samples[i] / ms)), samples: v.samples })) });
}
console.log(JSON.stringify({ scope: 'paired release A/B replay; first variant is the denominator', rounds, iterations, checksum, results }, null, 2));
