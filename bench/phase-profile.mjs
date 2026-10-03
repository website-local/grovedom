import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { kernel } from '../src/kernel.js';
import { instrument } from './instrument-kernel.mjs';
if (!process.env.TMPDIR) throw new Error('Set disk-backed TMPDIR for the instrumented facade.');
if (!kernel.profile) throw new Error('Build with GROVEDOM_PROFILE=1; use global heap for Wasm core timing.');
const temporary = join(process.env.TMPDIR, `grovedom-phase-facade-${process.pid}.mjs`);
const source = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8')
  .replace("'./selectors.js'", JSON.stringify(new URL('../src/selectors.js', import.meta.url).href));
const instrumented = source.replace("import { kernel } from './kernel.js';", `import { kernel as raw } from ${JSON.stringify(new URL('../src/kernel.js', import.meta.url).href)};
import { instrument } from ${JSON.stringify(new URL('./instrument-kernel.mjs', import.meta.url).href)};
export const measurement = instrument(raw);
const kernel = measurement.kernel;`);
writeFileSync(temporary, instrumented);
const { load, measurement } = await import(pathToFileURL(temporary).href);
unlinkSync(temporary);
const iterations = Number(process.env.GROVEDOM_PROFILE_ITERATIONS ?? 600);
const rows = Number(process.env.GROVEDOM_BENCH_ROWS ?? 120);
const { page, replay } = await import(process.env.GROVEDOM_PROFILE_WORKLOAD
  ? pathToFileURL(process.env.GROVEDOM_PROFILE_WORKLOAD).href : new URL('../test/fixtures.mjs', import.meta.url).href);
const html = process.env.GROVEDOM_PROFILE_INPUT ? readFileSync(process.env.GROVEDOM_PROFILE_INPUT, 'utf8') : page(rows);
for (let i = 0; i < 80; i++) replay(load, html);
kernel.profileReset();
const probeStart = performance.now(), probe = kernel.profileProbe().probe;
const probeWallNs = (performance.now() - probeStart) * 1e6 / 10000;
const empty = instrument({ read() {} });
for (let i = 0; i < 10000; i++) empty.kernel.read(null, 1, null, 'href');
const wrapperTimerFloorNs = empty.snapshot()['read:1'].milliseconds * 1e6 / 10000;
kernel.profileReset(); measurement.reset();
let checksum = 0;
const start = performance.now();
for (let i = 0; i < iterations; i++) checksum += replay(load, html).length;
const milliseconds = performance.now() - start;
console.log(JSON.stringify({ scope: 'instrumented authored replay; validate optimizations with uninstrumented paired timing',
  backend: process.env.GROVEDOM_BACKEND ?? 'napi', rows, iterations, checksum, milliseconds,
  calibration: { probeRecordedNs: probe[1] / probe[0], probeWallNs, wrapperTimerFloorNs },
  columns: ['calls', 'inclusiveNanoseconds', 'exclusiveNanoseconds', 'referenceTscTicks', 'units'],
  core: kernel.profile(), boundary: measurement.snapshot(), allocator: kernel.stats() }, null, 2));
