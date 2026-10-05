import test from 'node:test';
import assert from 'node:assert/strict';
import { releaseOptions } from '../scripts/ci/release-options.mjs';

test('release policy keeps prereleases off latest and rejects shell-shaped inputs', () => {
  assert.equal(releaseOptions('0.1.0', 'latest', 'wasm', 'oidc').gitTag, 'v0.1.0');
  assert.equal(releaseOptions('0.1.1-alpha.1', 'next', 'both', 'token').prerelease, true);
  for (const version of ['v0.1.0', '0.01.0', '0.1.0+build', '0.1.0;echo bad', '0.1.0\n'])
    assert.throws(() => releaseOptions(version, 'latest', 'wasm', 'oidc'));
  assert.throws(() => releaseOptions('0.1.0-rc.1', 'latest', 'wasm', 'oidc'));
  assert.throws(() => releaseOptions('0.1.0', 'latest', 'all', 'oidc'));
});
