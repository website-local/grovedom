// Run only in the manually dispatched, protected npm job. Never rebuild here.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { releaseOptions } from './release-options.mjs';
import { readRelease } from './artifacts.mjs';

const options = releaseOptions(process.env.RELEASE_VERSION, process.env.NPM_TAG, process.env.NPM_PACKAGES, process.env.NPM_AUTH);
assert.notEqual(options.packages, 'none');
assert.equal(process.env.GITHUB_EVENT_NAME, 'workflow_dispatch');
assert.equal(process.env.GITHUB_REF, 'refs/heads/main');
assert.equal(process.env.GITHUB_REPOSITORY, 'website-local/grovedom');
const root = resolve(process.argv[2]);
const manifest = readRelease(root, options.version, process.env.GITHUB_SHA);
const names = options.packages === 'both' ? ['grovedom', 'grovedom-native'] : ['grovedom'];
function npm(args) {
  const result = spawnSync('npm', [...args, '--registry=https://registry.npmjs.org/'], { encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}
// Validate every selected artifact/version before the first irreversible write.
const selected = names.map(name => {
  const row = manifest.packages.find(value => value.name === name);
  const result = npm(['view', `${name}@${row.version}`, 'dist.integrity', 'dist-tags', '--json']);
  if (result.status === 0) {
    const metadata = JSON.parse(result.stdout);
    assert.equal(metadata['dist.integrity'], row.integrity, `${name}@${row.version} already exists with different bytes`);
    const tagged = metadata['dist-tags']?.[options.tag] === row.version;
    // The pinned npm 11.6.2 exchanges OIDC credentials for publish, not dist-tag.
    // Detect a required tag change before publishing any other selected package.
    assert(tagged || options.auth === 'token',
      `${name}@${row.version} requires a dist-tag change; use token authentication with the pinned npm CLI`);
    return { ...row, exists: true, tagged };
  }
  let error;
  try { error = JSON.parse(result.stdout).error; } catch { /* Network/auth errors must fail closed. */ }
  assert.equal(error?.code, 'E404', result.stderr || 'npm version lookup failed');
  return { ...row, exists: false };
});
for (const row of selected) {
  if (row.tagged) {
    console.log(`${row.name}@${row.version}: identical version and tag verified`);
    continue;
  }
  const result = row.exists
    ? npm(['dist-tag', 'add', `${row.name}@${row.version}`, options.tag])
    : npm(['publish', join(root, row.file), '--ignore-scripts', '--access=public', '--provenance', '--tag', options.tag]);
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'npm publish failed');
  console.log(`${row.name}@${row.version}: ${row.exists ? 'identical version verified; tag set' : 'published'}`);
}
