import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function readRelease(directory, version, commit) {
  const manifest = JSON.parse(readFileSync(join(directory, 'release.json')));
  assert.equal(manifest.commit, commit, 'Tarballs belong to a different commit');
  assert.deepEqual(manifest.packages.map(row => row.name), ['grovedom', 'grovedom-native']);
  for (const row of manifest.packages) {
    assert.equal(row.version, version);
    assert.equal(row.file, `${row.name}-${version}.tgz`, 'Unexpected tarball path');
    const bytes = readFileSync(join(directory, row.file));
    assert.equal(row.sha256, createHash('sha256').update(bytes).digest('hex'), 'Corrupt tarball');
    assert.equal(row.integrity, 'sha512-' + createHash('sha512').update(bytes).digest('base64'), 'Corrupt npm integrity');
  }
  assert.equal(readFileSync(join(directory, 'SHA256SUMS'), 'utf8'), manifest.packages.map(row => `${row.sha256}  ${row.file}\n`).join(''));
  return manifest;
}
