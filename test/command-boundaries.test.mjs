import test from 'node:test';
import assert from 'node:assert/strict';
import { kernel } from '../diagnostics/kernel.js';

for (const observe of [false, true]) test(`invalid command tails preserve earlier effects and view bounds (observe=${observe})`, () => {
  const owner = kernel.create('<p>initial</p>', true, false);
  const ids = kernel.query(owner, 'p', Uint32Array.of(1), false), id = ids[0];
  const valid = byte => [3, 1, byte, 1, 0, 0, id];
  const tails = [
    [99, 1, 0, 1, 0, 0, id], [3], [3, 1, 0, 1, 0],
    [3, 0xffffffff, 0, 1, 0, 0, id],
    [3, 1, 2, 1, 0, 0, id], [3, 1, 0xffffffff, 2, 0, 0, id],
    [3, 1, 1, 0xffffffff, 0, 0, id],
    [1, 1, 0, 1, 2, 1, id], [1, 1, 0, 1, 0xffffffff, 2, id],
    [1, 1, 0, 1, 1, 0xffffffff, id],
  ];
  try {
    for (const tail of tails) {
      // Nonzero view offsets and spare backing bytes must not expand the valid
      // payload/word range. A valid suffix must never execute after failure.
      const storage = new Uint32Array(256), command = [...valid(0), ...tail, ...valid(1)];
      storage.set(command, 3);
      const words = storage.subarray(3, 3 + command.length);
      const bytes = new Uint8Array(32); bytes.set([65, 90], 5);
      const payload = bytes.subarray(5, 7);
      assert.throws(() => observe ? kernel.observe(owner, 2, ids, '', words, payload) : kernel.execute(owner, words, payload), { code: 'ERR_GROVEDOM_COMMAND' });
      assert.equal(kernel.read(owner, 2, ids, ''), 'A');
      kernel.execute(owner, Uint32Array.from(valid(1)), payload);
      assert.equal(kernel.read(owner, 2, ids, ''), 'Z');
    }
    for (const invalid of [0, 0xffffffff]) {
      const words = Uint32Array.from([...valid(0), 3, 2, 1, 1, 0, 0, id, invalid, ...valid(1)]);
      assert.throws(() => kernel.execute(owner, words, Uint8Array.of(65, 90)), { code: 'ERR_GROVEDOM_HANDLE' });
      assert.equal(kernel.read(owner, 2, ids, ''), 'A', 'Validate all IDs before applying a command');
    }
  } finally { kernel.dispose(owner); }
  assert.equal(kernel.stats().liveDocuments, 0);
  assert.equal(kernel.stats().liveBytes, 0);
});
