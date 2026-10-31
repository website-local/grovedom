import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { createWasmKernel } from '../src/wasm/kernel.js';
import { nodePlatform } from '../src/wasm/node.js';
import { browserPlatform } from '../src/wasm/browser.js';
import { wasmDiagnostics } from '../diagnostics/wasm.js';

let module;
export function ownerKernel(heap) {
  const growth = process.env.GROVEDOM_WASM_PROFILE_GROWTH === '1';
  module ??= new WebAssembly.Module(readFileSync(resolve(process.env.GROVEDOM_WASM_BUILD_DIR ?? 'build/wasm',
    growth ? 'grovedom-growth.wasm' : 'grovedom.wasm')));
  const diagnostics = wasmDiagnostics({ growth, lifecycle: true, poolSize: 1 });
  const platform = process.env.GROVEDOM_TEST_BROWSER === '1' ? browserPlatform : nodePlatform;
  return createWasmKernel(module, { heap, poolSize: 1 },
    { ...platform, imports: diagnostics.imports, runtimeCreated: diagnostics.runtimeCreated }, diagnostics.inspect);
}

export async function checkOwnerCollection(heap) {
  assert.equal(typeof global.gc, 'function');
  const kernel = ownerKernel(heap);
  const retained = kernel.create('<p>retained</p>', true, false)._state;
  const retainedOwner = new WeakRef(retained.handle);
  for (let i = 0; i < 3; i++) {
    await setImmediate(); global.gc(); await setImmediate();
  }
  assert.equal(retainedOwner.deref(), retained.handle);
  const ids = kernel.query(retained.handle, 'p', Uint32Array.of(1), false);
  assert.equal(kernel.read(retained.handle, 2, ids, ''), 'retained');
  assert.equal(kernel.stats().liveDocuments, 1);
  kernel.dispose(retained.handle);
  assert.equal(retained.runtime, null);

  function abandon() {
    const handle = kernel.create('<p>abandoned</p>', true, false);
    return { handle: new WeakRef(handle), state: new WeakRef(handle._state) };
  }
  const abandoned = abandon();
  for (let i = 0; i < 100; i++) {
    await setImmediate(); global.gc(); await setImmediate();
    if (kernel.lifecycleStats().activeDocuments === 0) break;
  }
  assert.equal(abandoned.handle.deref(), undefined);
  assert.equal(abandoned.state.deref(), undefined);
  assert.equal(kernel.lifecycleStats().collected, 1);
  assert.equal(kernel.stats().liveDocuments, 0);
  assert.equal(kernel.stats().liveBytes, 0);
  assert.equal(kernel.stats().controlBytes, 0);
  const fresh = kernel.create('<p>fresh</p>', true, false);
  try {
    assert.equal(kernel.read(fresh, 2, kernel.query(fresh, 'p', Uint32Array.of(1), false), ''), 'fresh');
  } finally { kernel.dispose(fresh); kernel.trim(); }
  assert.equal(kernel.lifecycleStats().activeDocuments, 0);
  assert.equal(kernel.lifecycleStats().idleBytes, 0);

  // Keep disposed state alive while dropping its kernel too. This catches
  // indirect retention through a scope token or a closure, including global heaps.
  function detach() {
    const isolated = ownerKernel(heap);
    const handle = isolated.create('<p>detached</p>', true, false);
    const state = handle._state, memory = new WeakRef(state.runtime.memory);
    isolated.query(handle, 'p', Uint32Array.of(1), false);
    isolated.dispose(handle); isolated.trim();
    return { state, memory };
  }
  const detached = detach();
  for (let i = 0; i < 100; i++) {
    await setImmediate(); global.gc(); await setImmediate();
    if (!detached.memory.deref()) break;
  }
  assert.equal(detached.state.runtime, null);
  assert.equal(detached.memory.deref(), undefined, 'Disposed state must not retain Wasm memory through its kernel');
}
