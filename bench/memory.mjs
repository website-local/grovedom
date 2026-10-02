import { load } from '../src/index.js';
import { kernel } from '../src/kernel.js';
import { page } from '../test/fixtures.mjs';
if (!global.gc) throw new Error('Run this diagnostic with --expose-gc.');
const samples = [];
async function sample(phase) {
  await new Promise(setImmediate);
  global.gc();
  await new Promise(setImmediate);
  const memory = process.memoryUsage();
  samples.push({ phase, kernel: kernel.stats(), process: { rss: memory.rss, heapUsed: memory.heapUsed, external: memory.external } });
}
await sample('initial');
let large = load(page(5000));
large('a').attr('data-probe', 'yes');
large.html();
await sample('large-live');
large.dispose(); large = null;
await sample('large-disposed');
for (let i = 0; i < 100; i++) { const small = load('<p>small</p>'); small.html(); small.dispose(); }
await sample('small-lifecycles-complete');
let nested = Array.from({ length: 8 }, () => load(page(80)));
await sample('eight-live');
for (const index of [5, 1, 7, 0, 6, 2, 4, 3]) nested[index].dispose();
nested = null;
await sample('all-disposed');
if (kernel.trim) { kernel.trim(); await sample('pool-trimmed'); }
console.log(JSON.stringify({ backend: process.env.GROVEDOM_BACKEND ?? 'napi', heap: process.env.GROVEDOM_WASM_HEAP, scope: 'retention diagnostic; not a fragmentation proof', samples }, null, 2));
