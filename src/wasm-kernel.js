import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const build = resolve(process.env.GROVEDOM_WASM_BUILD_DIR ?? resolve(root, 'build/wasm'));
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const metadata = JSON.parse(readFileSync(resolve(build, process.env.GROVEDOM_WASM_PROFILE_GROWTH === '1' ? 'growth-build.json' : 'build.json'), 'utf8'));
if (metadata.packageVersion !== pkg.version) throw new Error('Rebuild GroveDOM: glue and kernel must come from the same package version.');
const module = new WebAssembly.Module(readFileSync(resolve(build, process.env.GROVEDOM_WASM_PROFILE_GROWTH === '1' ? 'grovedom-growth.wasm' : 'grovedom.wasm')));
const heap = process.env.GROVEDOM_WASM_HEAP ?? 'global';
if (!['global', 'document', 'pool'].includes(heap)) throw new Error('Expected global, document, or pool Wasm heap.');
const perDocument = heap !== 'global';
const pooled = heap === 'pool';
const growth = { calls: 0, pages: 0, milliseconds: 0 };
const poolSize = Number(process.env.GROVEDOM_WASM_POOL_SIZE ?? 4);
const poolMaxBytes = Number(process.env.GROVEDOM_WASM_POOL_MAX_BYTES ?? 16 * 1024 * 1024);
if (!Number.isSafeInteger(poolSize) || poolSize < 0 || !Number.isSafeInteger(poolMaxBytes) || poolMaxBytes < 0) throw new Error('Wasm pool limits must be nonnegative integers.');
const pool = [];
let poolBytes = 0;
const encoder = new TextEncoder(), decoder = new TextDecoder();
const owners = new WeakMap(), live = new Set();
let retiredAllocations = 0, peakBytes = 0;

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
// Imports capture only module state. Reuse them across fresh and pooled
// instances instead of allocating another set of callbacks for each document.
const imports = { wasi_snapshot_preview1: {
  fd_close: () => 8,
  fd_seek: () => 8,
  fd_write: () => 8,
  proc_exit: code => { throw new Error(`Wasm kernel exited (${code})`); },
} };
if (metadata.profile) imports.env = { profile_now: () => performance.now() * 1e6 };
if (process.env.GROVEDOM_WASM_PROFILE_GROWTH === '1') {
  imports.env = { ...imports.env,
    growth_now: () => performance.now(),
    growth_sample: (pages, milliseconds) => { growth.calls++; growth.pages += pages; growth.milliseconds += milliseconds; },
  };
}
function instance() {
  // DOM operations have no file or process I/O. These libc support imports only
  // report unavailable descriptors; any unexpected process exit is an error.
  const runtime = new WebAssembly.Instance(module, imports).exports;
  runtime.gk_init();
  return runtime;
}
const shared = perDocument ? null : instance();
function statsOf(runtime) { return new Uint32Array(runtime.memory.buffer, runtime.gk_stats(), 4); }
function acquire() {
  if (!pool.length) return instance();
  const runtime = pool.pop();
  poolBytes -= runtime.memory.buffer.byteLength;
  return runtime;
}
function release(runtime) {
  const bytes = runtime.memory.buffer.byteLength;
  if (pooled && pool.length < poolSize && bytes <= poolMaxBytes - poolBytes) {
    pool.push(runtime);
    poolBytes += bytes;
  } else retiredAllocations += statsOf(runtime)[3];
}
const registry = new FinalizationRegistry(held => {
  live.delete(held.ref);
  if (held.runtime) {
    held.runtime.gk_delete(held.pointer);
    if (pooled) release(held.runtime);
  }
});
function owner(value, allowClosed = false) {
  const state = owners.get(value);
  if (!state) fail('ERR_GROVEDOM_HANDLE', 'Invalid document owner');
  if (!state.pointer && !allowClosed) fail('ERR_GROVEDOM_DISPOSED', 'Document has been disposed');
  return state;
}
function cstring(runtime, pointer) {
  const bytes = new Uint8Array(runtime.memory.buffer);
  const end = bytes.indexOf(0, pointer);
  return decoder.decode(bytes.subarray(pointer, end < 0 ? bytes.length : end));
}
function check(state, result) {
  if (!result) fail(cstring(state.runtime, state.runtime.gk_error_code(state.pointer)), cstring(state.runtime, state.runtime.gk_error_message(state.pointer)));
  return result;
}
function typed(value, type) {
  if (!(value instanceof type) || !(value.buffer instanceof ArrayBuffer)) fail('ERR_GROVEDOM_ARGUMENT', 'Expected an ordinary typed array of the required type');
}
function input(state, value) {
  if (typeof value !== 'string') fail('ERR_GROVEDOM_ARGUMENT', 'Expected a UTF-8 encodable string');
  const runtime = state.runtime;
  const pointer = check(state, runtime.gk_input(state.pointer, value.length * 3));
  const { written } = encoder.encodeInto(value, new Uint8Array(runtime.memory.buffer, pointer, value.length * 3));
  runtime.gk_input(state.pointer, written);
}
function ids(state, value) {
  typed(value, Uint32Array);
  const pointer = check(state, state.runtime.gk_transfer(state.pointer, value.byteLength));
  new Uint32Array(state.runtime.memory.buffer, pointer, value.length).set(value);
  return pointer;
}
function result(state, pointer) {
  check(state, pointer);
  const runtime = state.runtime;
  // Private wasm32 gd_result layout: kind, data pointer, length, scalar.
  const fields = new Uint32Array(runtime.memory.buffer, pointer, 4);
  switch (fields[0]) {
    case 0: return undefined;
    case 1: return decoder.decode(new Uint8Array(runtime.memory.buffer, fields[1], fields[2]));
    case 2: return fields[3];
    case 3: return new Uint32Array(runtime.memory.buffer, fields[1], fields[2]).slice();
    case 4: return null;
    default: throw new Error('Invalid kernel result');
  }
}

export const kernel = {
  configuration: { heap, initialPages: metadata.initialPages },
  growthStats() { return { ...growth }; },
  profileParse(html) {
    const runtime = shared ?? acquire();
    if (!runtime.gk_parse_profile) throw new Error('Parsing probe requires the growth diagnostic build.');
    const pointer = runtime.gk_new();
    if (!pointer) fail('ERR_GROVEDOM_MEMORY', 'Owner allocation failed');
    const state = { runtime, pointer };
    try { input(state, html); check(state, runtime.gk_parse_profile(pointer)); return runtime.memory.buffer.byteLength; }
    finally { runtime.gk_delete(pointer); if (perDocument) release(runtime); }
  },
  create(html, scripting, fragment) {
    if (typeof scripting !== 'boolean' || typeof fragment !== 'boolean') fail('ERR_GROVEDOM_ARGUMENT', 'Expected parser flags');
    const runtime = shared ?? acquire(), pointer = runtime.gk_new();
    if (!pointer) fail('ERR_GROVEDOM_MEMORY', 'Owner allocation failed');
    const state = { runtime, pointer };
    try { input(state, html); check(state, runtime.gk_parse(pointer, Number(scripting), Number(fragment))); }
    catch (error) { runtime.gk_delete(pointer); if (perDocument) release(runtime); throw error; }
    const handle = Object.freeze({});
    owners.set(handle, state);
    // Diagnostics may temporarily retain a runtime, but must not keep its owner
    // alive during a GC probe by dereferencing the owner itself.
    const ref = new WeakRef(runtime);
    state.ref = ref;
    live.add(ref);
    registry.register(handle, heap === 'document' ? { ref } : { ref, runtime, pointer }, handle);
    return handle;
  },
  dispose(handle) {
    const state = owner(handle, true);
    if (!state.pointer) return;
    registry.unregister(handle);
    live.delete(state.ref);
    state.runtime.gk_delete(state.pointer);
    if (perDocument) release(state.runtime);
    state.pointer = 0;
    state.runtime = null;
  },
  query(handle, selector, roots, match) {
    const state = owner(handle);
    if (typeof match !== 'boolean') fail('ERR_GROVEDOM_ARGUMENT', 'Expected matching flag');
    input(state, selector);
    const pointer = ids(state, roots);
    return result(state, state.runtime.gk_query(state.pointer, pointer, roots.length, Number(match)));
  },
  read(handle, operation, nodes, name) {
    const state = owner(handle);
    if (!Number.isInteger(operation)) fail('ERR_GROVEDOM_ARGUMENT', 'Expected read operation');
    if (operation === 1) input(state, name);
    const pointer = ids(state, nodes);
    return result(state, state.runtime.gk_read(state.pointer, operation, pointer, nodes.length));
  },
  observe(handle, operation, nodes, name, words, payload) {
    kernel.execute(handle, words, payload);
    return kernel.read(handle, operation, nodes, name);
  },
  traverse(handle, nodes, axis) {
    const state = owner(handle);
    if (!Number.isInteger(axis)) fail('ERR_GROVEDOM_ARGUMENT', 'Expected traversal axis');
    const pointer = ids(state, nodes);
    return result(state, state.runtime.gk_traverse(state.pointer, pointer, nodes.length, axis));
  },
  execute(handle, words, payload) {
    const state = owner(handle);
    typed(words, Uint32Array); typed(payload, Uint8Array);
    const pointer = check(state, state.runtime.gk_transfer(state.pointer, words.byteLength + payload.byteLength));
    new Uint32Array(state.runtime.memory.buffer, pointer, words.length).set(words);
    new Uint8Array(state.runtime.memory.buffer, pointer + words.byteLength, payload.byteLength).set(payload);
    check(state, state.runtime.gk_execute(state.pointer, pointer, words.length, pointer + words.byteLength, payload.byteLength));
  },
  edit(handle, operation, nodes, other, text) {
    const state = owner(handle);
    typed(nodes, Uint32Array); typed(other, Uint32Array);
    input(state, text);
    const pointer = check(state, state.runtime.gk_transfer(state.pointer, nodes.byteLength + other.byteLength));
    new Uint32Array(state.runtime.memory.buffer, pointer, nodes.length).set(nodes);
    new Uint32Array(state.runtime.memory.buffer, pointer + nodes.byteLength, other.length).set(other);
    return result(state, state.runtime.gk_edit(state.pointer, operation, pointer, nodes.length, pointer + nodes.byteLength, other.length));
  },
  stats() {
    if (shared) {
      const [liveDocuments, liveBytes, peakBytes, allocations] = statsOf(shared);
      return { liveDocuments, liveBytes, peakBytes, allocations, memoryBytes: shared.memory.buffer.byteLength };
    }
    let liveDocuments = 0, liveBytes = 0, allocations = retiredAllocations, memoryBytes = 0;
    for (const runtime of pool) { allocations += statsOf(runtime)[3]; memoryBytes += runtime.memory.buffer.byteLength; }
    for (const ref of live) {
      const runtime = ref.deref();
      if (!runtime) continue;
      const values = statsOf(runtime);
      liveDocuments += values[0]; liveBytes += values[1]; allocations += values[3];
      memoryBytes += runtime.memory.buffer.byteLength;
    }
    peakBytes = Math.max(peakBytes, liveBytes);
    return { liveDocuments, liveBytes, peakBytes, allocations, memoryBytes, idleInstances: pool.length, idleMemoryBytes: poolBytes };
  },
  trim() {
    for (const runtime of pool) retiredAllocations += statsOf(runtime)[3];
    pool.length = 0; poolBytes = 0;
  },
};

if (metadata.profile) {
  // Detailed core timing uses one runtime so abandoned instance collection
  // cannot silently erase counters. Heap ownership costs are measured separately.
  if (shared) {
    kernel.profile = () => {
      const data = new Float64Array(shared.memory.buffer, shared.gk_profile_snapshot(), shared.gk_profile_count() * 5);
      return Object.fromEntries(Array.from({ length: shared.gk_profile_count() }, (_, i) => [cstring(shared, shared.gk_profile_name(i)), Array.from(data.subarray(i * 5, i * 5 + 5))]));
    };
    kernel.profileReset = () => shared.gk_profile_reset();
    kernel.profileProbe = () => { shared.gk_profile_probe(10000); return kernel.profile(); };
  }
}
