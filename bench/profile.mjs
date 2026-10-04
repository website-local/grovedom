// Run with --cpu-prof and a disk-backed --cpu-prof-dir.
import { load } from '../diagnostics/index.js';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const { page, replay } = await import(process.env.GROVEDOM_PROFILE_WORKLOAD
  ? pathToFileURL(process.env.GROVEDOM_PROFILE_WORKLOAD).href : new URL('../test/fixtures.mjs', import.meta.url).href);
const source = process.env.GROVEDOM_PROFILE_INPUT ? readFileSync(process.env.GROVEDOM_PROFILE_INPUT, 'utf8')
  : page(Number(process.env.GROVEDOM_BENCH_ROWS ?? 120));
let consumed = 0;
for (let i = 0; i < Number(process.env.GROVEDOM_PROFILE_ITERATIONS ?? 2500); i++) consumed += replay(load, source).length;
console.log(JSON.stringify({ consumed }));
