import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { releaseOptions } from '../scripts/ci/release-options.mjs';

const read = path => JSON.parse(readFileSync(new URL('../' + path, import.meta.url)));
test('both release manifests and lockfile describe one version and supported platform contract', () => {
  const wasm = read('package.json'), native = read('packages/native/package.json'), lock = read('package-lock.json');
  assert.equal(releaseOptions(wasm.version, wasm.version.includes('-') ? 'next' : 'latest', 'both', 'oidc').version, wasm.version);
  assert.equal(native.version, wasm.version);
  assert.equal(lock.version, wasm.version);
  assert.equal(lock.packages[''].version, wasm.version);
  for (const pkg of [wasm, native]) {
    assert.equal(pkg.private, true, 'Only explicit package assembly may enable publication');
    assert.equal(pkg.type, 'module');
    assert.equal(pkg.license, 'MIT');
    assert.deepEqual(pkg.engines, { node: '>=22.0.0' });
    for (const key of ['dependencies', 'peerDependencies', 'optionalDependencies'])
      assert.equal(Object.keys(pkg[key] ?? {}).length, 0);
  }
  assert.deepEqual(native.os, ['linux']);
  assert.deepEqual(native.cpu, ['x64']);
  assert.deepEqual(native.libc, ['glibc']);
  assert.deepEqual(Object.keys(wasm.exports).sort(), ['.', './browser']);
  assert.deepEqual(Object.keys(native.exports), ['.']);
  assert.equal(wasm.exports['.'].node.default, './src/index.js');
  assert.equal(wasm.exports['.'].browser.default, './src/browser.js');
  assert.equal(wasm.exports['./browser'].import, './src/browser.js');
  assert.equal(native.exports['.'].import, './src/native.js');
});
