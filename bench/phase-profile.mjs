import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { kernel } from '../diagnostics/kernel.js';
import { instrument } from './instrument-kernel.mjs';
if (!process.env.TMPDIR) throw new Error('Set disk-backed TMPDIR for the instrumented facade.');
if (!kernel.profile) throw new Error('Build with GROVEDOM_PROFILE=1; use global heap for Wasm core timing.');
const { load, measurement } = await import('../diagnostics/instrumented.js');
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
  backend: process.env.GROVEDOM_BACKEND ?? 'wasm', rows, iterations, checksum, milliseconds,
  calibration: { probeRecordedNs: probe[1] / probe[0], probeWallNs, wrapperTimerFloorNs },
  columns: ['calls', 'inclusiveNanoseconds', 'exclusiveNanoseconds', 'referenceTscTicks', 'units'],
  core: kernel.profile(), boundary: measurement.snapshot(), allocator: kernel.stats() }, null, 2));
