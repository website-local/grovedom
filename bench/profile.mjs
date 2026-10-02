// Run with --cpu-prof and a disk-backed --cpu-prof-dir.
import { load } from '../src/index.js';
import { page, replay } from '../test/fixtures.mjs';
const source = page(Number(process.env.GROVEDOM_BENCH_ROWS ?? 120));
let consumed = 0;
for (let i = 0; i < Number(process.env.GROVEDOM_PROFILE_ITERATIONS ?? 2500); i++) consumed += replay(load, source).length;
console.log(JSON.stringify({ consumed }));
