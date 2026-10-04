// Profile complete preloaded corpora in one isolated implementation process.
// CPU: use Node --cpu-prof with a disk-backed --cpu-prof-dir.
// Heap: GROVEDOM_PROFILE_MODE=heap writes an allocation sampling profile.
// Retention: --expose-gc and GROVEDOM_PROFILE_MODE=retention write three heaps.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { writeHeapSnapshot } from 'node:v8';
import { Session } from 'node:inspector';

const manifest = JSON.parse(readFileSync(process.env.GROVEDOM_AB_MANIFEST, 'utf8'));
const variant = manifest.variants.find(v => v.name === process.env.GROVEDOM_PROFILE_VARIANT);
assert(variant, 'Select a manifest variant with GROVEDOM_PROFILE_VARIANT.');
const mode = process.env.GROVEDOM_PROFILE_MODE ?? 'cpu';
assert(['cpu', 'heap', 'retention'].includes(mode), 'Expected cpu, heap or retention mode.');
const directory = process.env.GROVEDOM_PROFILE_DIR;
if (mode !== 'cpu') {
  assert(process.env.TMPDIR && directory, 'Set disk-backed TMPDIR and GROVEDOM_PROFILE_DIR.');
  mkdirSync(directory, { recursive: true });
}
Object.assign(process.env, variant.env, { GROVEDOM_REPLAY_ENTRY: variant.entry });
const entry = pathToFileURL(variant.entry), facade = await import(entry.href), { load } = facade;
if (variant.options !== undefined) await facade.init(variant.options);
const kernel = variant.env?.GROVEDOM_BACKEND ? (await import(new URL('kernel.js', entry).href)).kernel : null;
const inputs = [];
for (const scenario of manifest.corpus) {
  const workload = scenario.workload ?? manifest.workload;
  const { page, replay } = await import(workload ? pathToFileURL(workload).href : new URL('../test/fixtures.mjs', import.meta.url).href);
  inputs.push({ scenario, replay, source: scenario.path ? readFileSync(scenario.path, 'utf8') : page(scenario.rows ?? 120) });
}
const iterations = Number(process.env.GROVEDOM_PROFILE_ITERATIONS ?? 1000);
assert(Number.isSafeInteger(iterations) && iterations > 0);
let consumed = 0;
async function replayCorpus() {
  for (const { scenario, replay, source } of inputs)
    consumed += (manifest.consumer ? await replay(source, scenario) : replay(load, source)).length;
}
for (let i = 0; i < 80; i++) await replayCorpus();
async function collect() {
  if (global.gc) for (let i = 0; i < 3; i++) { global.gc(); await new Promise(setImmediate); }
}
await collect();
const samples = [];
async function snapshot(phase) {
  kernel?.trim?.();
  await collect();
  samples.push({ phase, kernel: kernel?.stats(), process: process.memoryUsage() });
  writeHeapSnapshot(join(directory, phase + '.heapsnapshot'));
}
const session = mode === 'heap' ? new Session() : null;
const post = (method, params = {}) => new Promise((resolve, reject) => session.post(method, params, (error, result) => error ? reject(error) : resolve(result)));
if (session) {
  session.connect();
  await post('HeapProfiler.startSampling', { samplingInterval: 4096,
    includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
}
if (mode === 'retention') {
  assert(global.gc, 'Retention diagnostics require --expose-gc.');
  await snapshot('before');
}
const start = performance.now();
try {
  for (let i = 0; i < iterations; i++) {
    await replayCorpus();
    if (mode === 'retention' && i + 1 === Math.ceil(iterations / 2)) await snapshot('middle');
  }
  if (session) {
    const { profile } = await post('HeapProfiler.stopSampling');
    writeFileSync(join(directory, 'allocations.heapprofile'), JSON.stringify(profile));
  }
} finally { session?.disconnect(); }
if (mode === 'retention') await snapshot('after');
console.log(JSON.stringify({ scope: 'Instrumented corpus diagnostic; elapsed time is not a release benchmark. Heap sampling estimates JS allocation, not Wasm arena slots or allocator fragmentation.',
  mode, variant: variant.name, iterations, consumed, milliseconds: performance.now() - start,
  corpus: inputs.map(({ scenario, source }) => ({ id: scenario.id, bytes: Buffer.byteLength(source) })),
  kernel: kernel?.stats(), boundary: facade.measurement?.snapshot(), samples }, null, 2));
