import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWasmKernel } from '../src/wasm/kernel.js';
import { nodePlatform } from '../src/wasm/node.js';
import { wasmDiagnostics } from '../diagnostics/wasm.js';

const available = (process.env.GROVEDOM_BACKEND ?? 'wasm') === 'wasm';
const growth = process.env.GROVEDOM_WASM_PROFILE_GROWTH === '1';
function open(options) {
  const diagnostics = wasmDiagnostics({ lifecycle: true, growth, ...options });
  const module = new WebAssembly.Module(readFileSync(resolve(process.env.GROVEDOM_WASM_BUILD_DIR ?? 'build/wasm', growth ? 'grovedom-growth.wasm' : 'grovedom.wasm')));
  return createWasmKernel(module, { heap: 'pool', ...options },
    { ...nodePlatform, imports: diagnostics.imports, runtimeCreated: diagnostics.runtimeCreated }, diagnostics.inspect);
}
test('lifecycle counters distinguish creation, reuse, count limits, trim and warm resets', { skip: !available }, () => {
  const kernel = open({ poolSize: 1, poolMaxBytes: 16 * 1024 * 1024 });
  const a = kernel.create('<p>a</p>', true, false), b = kernel.create('<p>b</p>', true, false);
  kernel.dispose(a); kernel.dispose(b);
  let stats = kernel.lifecycleStats();
  assert.equal(stats.created, 2); assert.equal(stats.peakLiveDocuments, 2);
  assert.equal(stats.countLimit, 1); assert.equal(stats.byteLimit, 0);
  assert.equal(stats.timedCreations, 2); assert(stats.instancePrefixMilliseconds >= 0);
  kernel.lifecycleReset(); kernel.lifecycleLabel('warm');
  const c = kernel.create('<p>c</p>', true, false); kernel.dispose(c);
  kernel.dispose(c);
  stats = kernel.lifecycleStats();
  assert.equal(stats.created, 0); assert.equal(stats.reused, 1); assert.equal(stats.retained, 1);
  assert.equal(stats.activeDocuments, 0); assert.equal(stats.idleInstances, 1);
  assert(stats.events.every(event => event.label === 'warm' && event.instance === 1));
  kernel.trim();
  assert.equal(kernel.lifecycleStats().trimmed, 1); assert.equal(kernel.lifecycleStats().idleBytes, 0);
});
test('byte-limit retirement and failed creation remain observable without active owners', { skip: !available }, () => {
  const kernel = open({ poolSize: 8, poolMaxBytes: 0 });
  const a = kernel.create('<p>a</p>', true, false); kernel.dispose(a);
  assert.throws(() => kernel.create(123, true, false), { code: 'ERR_GROVEDOM_ARGUMENT' });
  const stats = kernel.lifecycleStats();
  assert.equal(stats.created, 2); assert.equal(stats.byteLimit, 2);
  assert.equal(stats.activeDocuments, 0); assert.equal(stats.countLimit, 0);
  assert.equal(stats.retiredBytes, stats.initialBytes);
});
test('growth diagnostics account for actual linear-memory pages', { skip: !available || !growth }, () => {
  const kernel = open({ poolSize: 1, poolMaxBytes: 32 * 1024 * 1024 });
  const handle = kernel.create('<p>long input</p>'.repeat(10000), true, false);
  const memoryBytes = kernel.stats().memoryBytes;
  const growth = kernel.growthStats();
  assert(growth.calls > 0); assert(growth.milliseconds >= 0);
  assert.equal(growth.pages * 65536, memoryBytes - kernel.lifecycleStats().initialBytes);
  kernel.dispose(handle);
  assert.deepEqual(kernel.growthStats(), growth);
  assert.equal(kernel.lifecycleStats().activeDocuments, 0);
  assert.equal(kernel.stats().liveBytes, 0);
});
