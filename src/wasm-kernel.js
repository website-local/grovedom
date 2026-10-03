import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
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
const empty = new Uint32Array();
const owners = new WeakMap(), live = new Set();
let retiredAllocations = 0, peakBytes = 0;

function fail(code, message) { const error = new Error(message); error.code = code; throw error; }
// Release modules have no imports. Diagnostic callbacks capture only module
// state and are reused across fresh and pooled instances.
const imports = {};
if (metadata.profile) imports.env = { profile_now: () => performance.now() * 1e6 };
if (process.env.GROVEDOM_WASM_PROFILE_GROWTH === '1') {
  imports.env = { ...imports.env,
    growth_now: () => performance.now(),
    growth_sample: (pages, milliseconds) => { growth.calls++; growth.pages += pages; growth.milliseconds += milliseconds; },
  };
}
function instance() {
  const runtime = new WebAssembly.Instance(module, imports).exports;
  runtime.gk_init();
  return { ...runtime, scratch: runtime.gk_scratch() };
}
const shared = perDocument ? null : instance();
function statsOf(runtime) { return new Uint32Array(runtime.memory.buffer, runtime.gk_stats(), 5); }
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
function views(state) {
  // A different document can grow the global heap between calls. Refresh after
  // every allocating export, and never return these borrowed views to callers.
  const buffer = state.runtime.memory.buffer;
  if (state.bytes?.buffer !== buffer) {
    state.bytes = Buffer.from(buffer);
    state.words = new Uint32Array(buffer);
  }
}
function input(state, value) {
  if (typeof value !== 'string') fail('ERR_GROVEDOM_ARGUMENT', 'Expected a UTF-8 encodable string');
  const runtime = state.runtime;
  const pointer = check(state, runtime.gk_input(state.pointer, value.length * 3));
  views(state);
  let written = 0;
  if (value.length <= 128) {
    while (written < value.length && value.charCodeAt(written) < 128) {
      state.bytes[pointer + written] = value.charCodeAt(written);
      written++;
    }
  }
  if (written !== value.length) {
    written = encoder.encodeInto(value, state.bytes.subarray(pointer, pointer + value.length * 3)).written;
  }
  runtime.gk_input(state.pointer, written);
}
function ids(state, value) {
  if (!(value instanceof Uint32Array) || !(value.buffer instanceof ArrayBuffer)) fail('ERR_GROVEDOM_ARGUMENT', 'Expected an ordinary Uint32Array');
  const pointer = transfer(state, value.byteLength);
  views(state);
  state.words.set(value, pointer >>> 2);
  return pointer;
}
function transfer(state, length) {
  // Shared within one instance, only during a synchronous kernel call. Large
  // operations retain the existing document-owned, geometrically grown buffer.
  if (length > 0x7fffffff) fail('ERR_GROVEDOM_MEMORY', 'Transfer exceeds the Wasm memory limit');
  return length <= 16384 ? state.runtime.scratch : check(state, state.runtime.gk_transfer(state.pointer, length));
}
function result(state, pointer) {
  check(state, pointer);
  views(state);
  // Private wasm32 gd_result layout: kind, data pointer, length, scalar.
  const fields = state.words, offset = pointer >>> 2;
  const data = fields[offset + 1], length = fields[offset + 2];
  switch (fields[offset]) {
    case 0: return undefined;
    case 1: return state.bytes.toString('utf8', data, data + length);
    case 2: return fields[offset + 3];
    case 3: return length ? fields.slice(data >>> 2, (data >>> 2) + length) : empty;
    case 4: return null;
    default: throw new Error('Invalid kernel result');
  }
}

export const kernel = {
  configuration: { heap, initialPages: metadata.initialPages, stackBytes: metadata.stackBytes },
  growthStats() { return { ...growth }; },
  profileParse(html) {
    const runtime = shared ?? acquire();
    if (!runtime.gk_parse_profile) throw new Error('Parsing probe requires the growth diagnostic build.');
    const pointer = runtime.gk_new();
    if (!pointer) fail('ERR_GROVEDOM_MEMORY', 'Owner allocation failed');
    const state = { runtime, pointer, bytes: null, words: null };
    try { input(state, html); check(state, runtime.gk_parse_profile(pointer)); return runtime.memory.buffer.byteLength; }
    finally { runtime.gk_delete(pointer); if (perDocument) release(runtime); }
  },
  createXML(html, flags) { return this.create(html, true, false, flags); },
  create(html, scripting, fragment, xmlFlags) {
    if (typeof scripting !== 'boolean' || typeof fragment !== 'boolean') fail('ERR_GROVEDOM_ARGUMENT', 'Expected parser flags');
    const runtime = shared ?? acquire(), pointer = runtime.gk_new();
    if (!pointer) fail('ERR_GROVEDOM_MEMORY', 'Owner allocation failed');
    const state = { runtime, pointer, bytes: null, words: null };
    try { input(state, html); check(state, xmlFlags === undefined ? runtime.gk_parse(pointer, Number(scripting), Number(fragment)) : runtime.gk_parse_xml(pointer, xmlFlags)); }
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
    state.bytes = state.words = null;
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
    let pointer, count;
    if (typeof nodes === 'number') {
      if (!Number.isInteger(nodes) || nodes < 0 || nodes > 0xffffffff) fail('ERR_GROVEDOM_ARGUMENT', 'Expected a node ID');
      pointer = transfer(state, 4); views(state);
      state.words[pointer >>> 2] = nodes; count = 1;
    } else { pointer = ids(state, nodes); count = nodes.length; }
    return result(state, state.runtime.gk_read(state.pointer, operation, pointer, count));
  },
  observe(handle, operation, nodes, name, words, payload) {
    const state = owner(handle);
    if (!(words instanceof Uint32Array) || !(words.buffer instanceof ArrayBuffer) ||
        !(payload instanceof Uint8Array) || !(payload.buffer instanceof ArrayBuffer)) fail('ERR_GROVEDOM_ARGUMENT', 'Expected ordinary command and payload arrays');
    if (!Number.isInteger(operation)) fail('ERR_GROVEDOM_ARGUMENT', 'Expected read operation');
    const scalar = typeof nodes === 'number';
    if (scalar ? !Number.isInteger(nodes) || nodes < 0 || nodes > 0xffffffff
      : !(nodes instanceof Uint32Array) || !(nodes.buffer instanceof ArrayBuffer)) fail('ERR_GROVEDOM_ARGUMENT', 'Expected node IDs');
    if (operation !== 1) name = '';
    if (typeof name !== 'string') fail('ERR_GROVEDOM_ARGUMENT', 'Expected a UTF-8 encodable string');
    const count = scalar ? 1 : nodes.length;
    const pointer = transfer(state, words.byteLength + count * 4 + payload.byteLength + name.length * 3);
    const nodePointer = pointer + words.byteLength, payloadPointer = nodePointer + count * 4;
    const namePointer = payloadPointer + payload.byteLength;
    views(state);
    state.words.set(words, pointer >>> 2);
    if (scalar) state.words[nodePointer >>> 2] = nodes;
    else state.words.set(nodes, nodePointer >>> 2);
    state.bytes.set(payload, payloadPointer);
    let written = 0;
    while (written < name.length && name.charCodeAt(written) < 128) {
      state.bytes[namePointer + written] = name.charCodeAt(written); written++;
    }
    if (written !== name.length) written = encoder.encodeInto(name, state.bytes.subarray(namePointer, namePointer + name.length * 3)).written;
    return result(state, state.runtime.gk_observe(state.pointer, pointer, words.length, payloadPointer, payload.byteLength,
      operation, nodePointer, count, namePointer, written));
  },
  traverse(handle, nodes, axis) {
    const state = owner(handle);
    if (!Number.isInteger(axis)) fail('ERR_GROVEDOM_ARGUMENT', 'Expected traversal axis');
    const pointer = ids(state, nodes);
    return result(state, state.runtime.gk_traverse(state.pointer, pointer, nodes.length, axis));
  },
  execute(handle, words, payload) {
    const state = owner(handle);
    if (!(words instanceof Uint32Array) || !(words.buffer instanceof ArrayBuffer) ||
        !(payload instanceof Uint8Array) || !(payload.buffer instanceof ArrayBuffer)) fail('ERR_GROVEDOM_ARGUMENT', 'Expected ordinary command and payload arrays');
    const pointer = transfer(state, words.byteLength + payload.byteLength);
    views(state);
    state.words.set(words, pointer >>> 2);
    state.bytes.set(payload, pointer + words.byteLength);
    check(state, state.runtime.gk_execute(state.pointer, pointer, words.length, pointer + words.byteLength, payload.byteLength));
  },
  edit(handle, operation, nodes, other, text) {
    const state = owner(handle);
    if (!(nodes instanceof Uint32Array) || !(nodes.buffer instanceof ArrayBuffer) ||
        !(other instanceof Uint32Array) || !(other.buffer instanceof ArrayBuffer)) fail('ERR_GROVEDOM_ARGUMENT', 'Expected ordinary node arrays');
    input(state, text);
    const pointer = transfer(state, nodes.byteLength + other.byteLength);
    views(state);
    state.words.set(nodes, pointer >>> 2);
    state.words.set(other, (pointer + nodes.byteLength) >>> 2);
    return result(state, state.runtime.gk_edit(state.pointer, operation, pointer, nodes.length, pointer + nodes.byteLength, other.length));
  },
  stats() {
    if (shared) {
      const [liveDocuments, liveBytes, peakBytes, allocations, controlBytes] = statsOf(shared);
      return { liveDocuments, liveBytes, peakBytes, allocations, controlBytes, memoryBytes: shared.memory.buffer.byteLength };
    }
    let liveDocuments = 0, liveBytes = 0, allocations = retiredAllocations, memoryBytes = 0, controlBytes = 0;
    for (const runtime of pool) { allocations += statsOf(runtime)[3]; memoryBytes += runtime.memory.buffer.byteLength; }
    for (const ref of live) {
      const runtime = ref.deref();
      if (!runtime) continue;
      const values = statsOf(runtime);
      liveDocuments += values[0]; liveBytes += values[1]; allocations += values[3];
      controlBytes += values[4];
      memoryBytes += runtime.memory.buffer.byteLength;
    }
    peakBytes = Math.max(peakBytes, liveBytes);
    return { liveDocuments, liveBytes, peakBytes, allocations, controlBytes, memoryBytes, idleInstances: pool.length, idleMemoryBytes: poolBytes };
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
