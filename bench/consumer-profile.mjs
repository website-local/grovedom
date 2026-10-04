import { readFileSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
const entry = process.env.GROVEDOM_PROFILE_ENTRY ? pathToFileURL(process.env.GROVEDOM_PROFILE_ENTRY) : new URL('../diagnostics/index.js', import.meta.url);
const { kernel } = await import(new URL('./kernel.js', entry));
process.env.GROVEDOM_REPLAY_ENTRY = fileURLToPath(entry);

if (!process.env.TMPDIR) throw new Error('Set a disk-backed TMPDIR');
let measurement;
if (process.env.GROVEDOM_PROFILE_BOUNDARY !== '0') {
  const instrumented = new URL('./instrumented.js', entry);
  process.env.GROVEDOM_REPLAY_ENTRY = fileURLToPath(instrumented);
  ({ measurement } = await import(instrumented));
}
const { replay } = await import('./consumer-replay.mjs');
const manifest = JSON.parse(readFileSync(process.env.GROVEDOM_CORPUS_MANIFEST));
const corpus = manifest.map(item => ({ ...item, source: readFileSync(item.path, 'utf8') }));
const iterations = Number(process.env.GROVEDOM_PROFILE_ITERATIONS ?? 100);
const results = [];
for (const item of corpus) {
  for (let i = 0; i < 30; i++) await replay(item.source, item);
  measurement?.reset(); kernel.profileReset?.();
  let consumed = 0;
  const start = performance.now();
  for (let i = 0; i < iterations; i++) consumed += (await replay(item.source, item)).length;
  results.push({ id: item.id, iterations, consumed, milliseconds: performance.now() - start,
    columns: ['calls', 'inclusiveNanoseconds', 'exclusiveNanoseconds', 'referenceTscTicks', 'units'],
    core: kernel.profile?.(), boundary: measurement?.snapshot(), allocator: kernel.stats() });
}
console.log(JSON.stringify({ scope: 'instrumented real consumer transform replay; diagnostic only, not release timing', results }, null, 2));
