import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
const entry = process.env.GROVEDOM_PROFILE_ENTRY ? pathToFileURL(process.env.GROVEDOM_PROFILE_ENTRY) : new URL('../src/index.js', import.meta.url);
const { kernel } = await import(new URL('./kernel.js', entry));
process.env.GROVEDOM_REPLAY_ENTRY = fileURLToPath(entry);

if (!process.env.TMPDIR) throw new Error('Set a disk-backed TMPDIR');
const temporary = join(process.env.TMPDIR, `grovedom-consumer-profile-${process.pid}.mjs`);
let measurement;
if (process.env.GROVEDOM_PROFILE_BOUNDARY !== '0') {
  const source = readFileSync(entry, 'utf8')
    .replace("'./selectors.js'", JSON.stringify(new URL('./selectors.js', entry).href))
    .replace("import { kernel } from './kernel.js';", `import { kernel as raw } from ${JSON.stringify(new URL('./kernel.js', entry).href)};
import { instrument } from ${JSON.stringify(new URL('./instrument-kernel.mjs', import.meta.url).href)};
export const measurement = instrument(raw, { queryDetails: true, allocationDetails: process.env.GROVEDOM_PROFILE_ALLOCATIONS === '1' });
const kernel = measurement.kernel;`);
  writeFileSync(temporary, source);
  process.env.GROVEDOM_REPLAY_ENTRY = temporary;
  ({ measurement } = await import(pathToFileURL(temporary).href));
}
const { replay } = await import('./consumer-replay.mjs');
if (measurement) unlinkSync(temporary);
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
