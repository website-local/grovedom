// Run once in a fresh process for each source/artifact pair. This records
// allocator requests and capacity, not elapsed time or JS allocations.
import { load } from '../src/index.js';
import { kernel } from '../src/kernel.js';
import { page, replay } from '../test/fixtures.mjs';

const rows = Number(process.env.GROVEDOM_BENCH_ROWS ?? 120);
if (!Number.isSafeInteger(rows) || rows < 1) throw new Error('Expected a positive article count.');
const before = kernel.stats();
const output = replay(load, page(rows));
const after = kernel.stats();
console.log(JSON.stringify({ scope: 'single authored replay; includes disposal; excludes JS allocations', rows,
  outputBytes: Buffer.byteLength(output), allocationRequests: after.allocations - before.allocations, after,
  peakScope: process.env.GROVEDOM_BACKEND === 'wasm' && (process.env.GROVEDOM_WASM_HEAP ?? 'global') !== 'global'
    ? 'sampled live bytes only; use global heap for the core high-water counter' : 'core backing allocations',
}, null, 2));
