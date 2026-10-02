// Deterministic capacity/lifetime diagnostic, deliberately separate from timing.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { page } from '../test/fixtures.mjs';
import { page as sitemap, svg } from './xml-fixtures.mjs';

if (!global.gc) throw new Error('Run with --expose-gc');
const entry = process.env.GROVEDOM_MEMORY_ENTRY;
const { load } = await import(entry ? pathToFileURL(entry).href : '../src/index.js');
const { kernel } = await import(entry ? new URL('./kernel.js', pathToFileURL(entry)).href : '../src/kernel.js');
const cycles = Number(process.env.GROVEDOM_MEMORY_CYCLES ?? 24);
if (!Number.isSafeInteger(cycles) || cycles < 8) throw new Error('Expected at least eight cycles');
const inputs = [
  { id: 'small', source: page(8) }, { id: 'medium', source: page(160) },
  { id: 'large', source: page(1200) },
  { id: 'sitemap', source: sitemap(600), options: { xml: true } },
  { id: 'svg', source: svg(240), options: { xml: true } },
];
if (process.env.GROVEDOM_CORPUS_MANIFEST) for (const item of JSON.parse(readFileSync(process.env.GROVEDOM_CORPUS_MANIFEST))) {
  inputs.push({ id: item.id, source: readFileSync(item.path, 'utf8'), options: item.xml ? { xml: true } : undefined });
}
const samples = [], windows = [], retained = [];
let peakLiveBytes = 0, peakMemoryBytes = 0, checksum = 0;
function stats() {
  const value = kernel.stats();
  peakLiveBytes = Math.max(peakLiveBytes, value.liveBytes);
  peakMemoryBytes = Math.max(peakMemoryBytes, value.memoryBytes ?? 0);
  return value;
}
async function sample(phase) {
  const beforeGC = { kernel: stats(), process: process.memoryUsage() };
  await new Promise(setImmediate); global.gc(); await new Promise(setImmediate);
  samples.push({ phase, beforeGC, kernel: stats(), process: process.memoryUsage() });
}
function exercise($, index) {
  const nodes = $('a, image, loc');
  nodes.attr('data-cycle', String(index));
  checksum += nodes.length + $.html().length;
  return nodes.first();
}
await sample('initial');
// The same multiset of owner sizes repeats, with holes opened in varied order.
// All owners are explicitly released; selected handles deliberately survive.
const order = [5, 1, 7, 0, 6, 2, 4, 3];
for (let cycle = 0; cycle < cycles; cycle++) {
  const before = stats();
  const owners = Array.from({ length: 8 }, (_, slot) => {
    const input = inputs[(cycle * 8 + slot) % inputs.length];
    const $ = load(input.source, input.options);
    const handle = exercise($, cycle); stats();
    return { $, handle };
  });
  for (const slot of order) {
    const { $, handle } = owners[slot];
    $.dispose(); $.dispose();
    assert.throws(() => handle.text(), { code: 'ERR_GROVEDOM_DISPOSED' });
    retained.push(handle);
    const small = load(inputs[0].source); exercise(small, cycle); small.dispose(); stats();
  }
  const after = stats();
  assert.equal(after.liveDocuments, 0); assert.equal(after.liveBytes, 0);
  windows.push({ cycle, allocationRequests: after.allocations - before.allocations, ...after });
  if (cycle % 4 === 3) await sample(`mixed-${cycle + 1}`);
}
// Keep three owners pinned while replacing the other five in varied order.
// This exercises reuse without an all-documents-disposed coalescing boundary.
const slotInputs = [0, 1, 4, 2, 3, 0, 1, 2];
const anchored = slotInputs.map(index => load(inputs[index].source, inputs[index].options));
for (let step = 0; step < 500; step++) {
  const slot = 3 + (step * 3) % 5, input = inputs[slotInputs[slot]];
  anchored[slot].dispose();
  anchored[slot] = load(input.source, input.options);
  exercise(anchored[slot], step); stats();
  if (step % 20 === 19) await sample(`anchored-${step + 1}`);
}
for (const slot of order) anchored[slot].dispose();
assert.equal(stats().liveBytes, 0); assert.equal(stats().liveDocuments, 0);
// Replacing unobserved children should reuse arenas; retaining detached nodes
// intentionally needs storage until disposal and is measured separately.
for (const keep of [false, true]) {
  const $ = load('<main></main>'), root = $('main'), handles = [];
  const points = [];
  for (let i = 0; i < 800; i++) {
    root.html(`<p data-value="${'v'.repeat([16, 256, 4096, 64][i % 4])}">text <b>child</b></p>`);
    $.flush();
    if (keep) handles.push(root.children());
    if (i % 100 === 99) points.push({ iteration: i + 1, ...stats() });
  }
  if (!keep) assert.equal(points.at(-1).liveBytes, points[3].liveBytes, 'unobserved replacement must plateau');
  if (keep) assert.equal(handles[0].attr('data-value'), 'v'.repeat(16), 'retained detached snapshot must remain readable');
  checksum += root.text().length;
  $.dispose();
  samples.push({ phase: keep ? 'retained-detached' : 'recycled-children', points, after: stats() });
}
await sample('disposed-with-handles');
retained.length = 0;
await sample('handles-dropped');
if (kernel.trim) { kernel.trim(); await sample('trimmed'); }
assert.equal(stats().liveBytes, 0); assert.equal(stats().liveDocuments, 0);
// Workload-specific regression ceilings, not application concurrency limits.
// Optional private corpora have different sizes and are reported without these
// authored-fixture ceilings. JS/allocator RSS retention remains diagnostic.
const mib = 1024 * 1024;
const wasm = process.env.GROVEDOM_BACKEND === 'wasm';
const heap = process.env.GROVEDOM_WASM_HEAP ?? 'global';
const budgets = process.env.GROVEDOM_CORPUS_MANIFEST ? null : {
  trackedLiveBytes: (wasm ? 14 : 24) * mib,
  wasmCapacityBytes: (heap === 'global' ? 16 : heap === 'pool' ? 32 : 24) * mib,
};
if (budgets) {
  assert.ok(peakLiveBytes <= budgets.trackedLiveBytes, 'tracked capacity exceeds authored mixed-owner budget');
  assert.ok(peakMemoryBytes <= budgets.wasmCapacityBytes, 'linear capacity exceeds authored mixed-owner budget');
  if (wasm && heap === 'global') assert.equal(windows.at(-1).memoryBytes, windows[Math.min(9, windows.length - 1)].memoryBytes, 'shared heap must reuse its warmed capacity');
  const pinned = samples.filter(s => s.phase.startsWith('anchored-'));
  assert.equal(pinned.at(-1).kernel.liveBytes, pinned.at(-5).kernel.liveBytes, 'pinned-owner backing capacity must plateau');
  if (wasm) assert.equal(pinned.at(-1).kernel.memoryBytes, pinned.at(-5).kernel.memoryBytes, 'pinned-owner linear capacity must plateau');
}
console.log(JSON.stringify({
  scope: 'explicit disposal, eight mixed live owners, retained disposed selections, repeated child replacement; no timing claims',
  limits: 'Backing allocations include arena capacity, not live node payload. Wasm capacity minus tracked bytes includes static data, stack, allocator overhead, free blocks and slack; it is not a fragmentation measurement. RSS/GC are observations, not deterministic budgets.',
  backend: process.env.GROVEDOM_BACKEND ?? 'napi', heap: process.env.GROVEDOM_WASM_HEAP,
  cycles, checksum, inputs: inputs.map(({ id, source }) => ({ id, bytes: Buffer.byteLength(source) })),
  budgets, peakLiveBytes, peakMemoryBytes, windows, samples,
}, null, 2));
