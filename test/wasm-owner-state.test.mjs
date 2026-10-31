import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { ownerKernel } from './wasm-owner-fixture.mjs';

const available = (process.env.GROVEDOM_BACKEND ?? 'wasm') === 'wasm';
for (const heap of ['pool', 'global', 'document']) {
  test(`Wasm ${heap} validates owner identity and detaches retained state on disposal`, { skip: !available }, () => {
    const kernel = ownerKernel(heap), other = ownerKernel(heap);
    const owner = kernel.create('<p>first</p>', true, false);
    const sibling = kernel.create('<p>sibling</p>', true, false);
    const foreign = other.create('<p>foreign</p>', true, false);
    const retained = owner._state, runtime = retained.runtime;
    const read = handle => kernel.read(handle, 2, kernel.query(handle, 'p', Uint32Array.of(1), false), '');
    try {
      assert.equal(read(owner), 'first');
      assert.equal(Object.isFrozen(owner), true);
      assert.throws(() => { owner._state = {}; }, TypeError);
      for (const invalid of [null, {}, Object.create(owner), { ...owner }, foreign]) {
        assert.throws(() => read(invalid), { code: 'ERR_GROVEDOM_HANDLE' });
        assert.throws(() => kernel.dispose(invalid), { code: 'ERR_GROVEDOM_HANDLE' });
      }
      kernel.dispose(owner);
      kernel.dispose(owner);
      assert.equal(retained.pointer, 0);
      assert.equal(retained.runtime, null);
      assert.equal(retained.bytes, null);
      assert.equal(retained.words, null);
      const pending = [retained], seen = new Set();
      while (pending.length) {
        const value = pending.pop();
        if (!value || typeof value !== 'object' || seen.has(value)) continue;
        seen.add(value);
        assert.notEqual(value, runtime);
        assert(!(value instanceof WebAssembly.Memory));
        assert(!(value instanceof ArrayBuffer));
        assert(!ArrayBuffer.isView(value));
        for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
          if ('value' in descriptor) pending.push(descriptor.value);
        }
      }
      const fresh = kernel.create('<p>fresh</p>', true, false);
      try {
        if (heap === 'pool') assert.equal(fresh._state.runtime, runtime);
        assert.equal(read(fresh), 'fresh');
        assert.equal(read(sibling), 'sibling');
        assert.throws(() => read(owner), { code: 'ERR_GROVEDOM_DISPOSED' });
      } finally { kernel.dispose(fresh); }
      assert.throws(() => kernel.create({}, true, false), { code: 'ERR_GROVEDOM_ARGUMENT' });
    } finally {
      kernel.dispose(owner); kernel.dispose(sibling); other.dispose(foreign);
      kernel.trim(); other.trim();
    }
    for (const value of [kernel, other]) {
      assert.equal(value.stats().liveDocuments, 0);
      assert.equal(value.stats().liveBytes, 0);
      assert.equal(value.stats().controlBytes, 0);
      assert.equal(value.lifecycleStats().idleBytes, 0);
    }
  });
}

test('Wasm state preserves live owners, releases disposed memory and allows unreachable cycles to collect', { skip: !available }, () => {
  const result = spawnSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', `
    import { checkOwnerCollection } from ${JSON.stringify(new URL('./wasm-owner-fixture.mjs', import.meta.url).href)};
    for (const heap of ['pool', 'global', 'document']) await checkOwnerCollection(heap);
  `], { env: process.env, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
});
