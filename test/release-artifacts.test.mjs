import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRelease } from '../scripts/ci/artifacts.mjs';
import { mockProcessEnv } from './mock-process.mjs';

const version = '0.1.0', commit = 'a'.repeat(40);
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'grovedom-release-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const packages = ['grovedom', 'grovedom-native'].map(name => {
    const bytes = Buffer.from(name), file = `${name}-${version}.tgz`;
    writeFileSync(join(root, file), bytes);
    return { name, version, file, sha256: createHash('sha256').update(bytes).digest('hex'),
      integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') };
  });
  writeFileSync(join(root, 'release.json'), JSON.stringify({ commit, packages }));
  writeFileSync(join(root, 'SHA256SUMS'), packages.map(row => `${row.sha256}  ${row.file}\n`).join(''));
  return { root, packages };
}

test('release artifacts reject changed bytes, commits and paths before publication', t => {
  const { root, packages } = fixture(t);
  assert.equal(readRelease(root, version, commit).packages.length, 2);
  assert.throws(() => readRelease(root, version, 'b'.repeat(40)), /different commit/);
  writeFileSync(join(root, packages[1].file), 'changed');
  assert.throws(() => readRelease(root, version, commit), /Corrupt tarball/);
  packages[1].file = '../outside.tgz';
  writeFileSync(join(root, 'release.json'), JSON.stringify({ commit, packages }));
  assert.throws(() => readRelease(root, version, commit), /Unexpected tarball path/);
});

// Execute the actual publisher against a process-local fake npm. No registry,
// credentials or network access is involved. The publisher runs on Linux in CI.
for (const scenario of ['new', 'existing', 'mismatch', 'network']) {
  test(`npm release ${scenario}: checks all versions before any write`, { skip: process.platform === 'win32' }, t => {
    const { root, packages } = fixture(t), bin = join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(join(root, 'package.json'), '{"type":"commonjs"}');
    writeFileSync(join(bin, 'npm'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2), env = process.env;
fs.appendFileSync(env.MOCK_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'view') {
  if (env.MOCK_SCENARIO === 'new') { console.log(JSON.stringify({error:{code:'E404'}})); process.exit(1); }
  if (env.MOCK_SCENARIO === 'network') { console.log(JSON.stringify({error:{code:'E503'}})); process.exit(1); }
  const name = args[1].split('@')[0], rows = JSON.parse(fs.readFileSync(env.MOCK_MANIFEST)).packages;
  console.log(JSON.stringify(env.MOCK_SCENARIO === 'mismatch' && name === 'grovedom-native' ? 'different-integrity' : rows.find(row => row.name === name).integrity));
}

`, { mode: 0o755 });
    const log = join(root, 'calls.jsonl');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/ci/publish.mjs', import.meta.url)), root], {
      encoding: 'utf8', env: mockProcessEnv({ PATH: bin + delimiter + process.env.PATH,
        RELEASE_VERSION: version, NPM_TAG: 'latest', NPM_PACKAGES: 'both', NPM_AUTH: 'oidc',
        GITHUB_SHA: commit, GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch',
        GITHUB_REPOSITORY: 'website-local/grovedom', MOCK_SCENARIO: scenario,
        MOCK_LOG: log, MOCK_MANIFEST: join(root, 'release.json') }),
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    const calls = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse) : [];
    const writes = calls.filter(row => row[0] !== 'view');
    if (['mismatch', 'network'].includes(scenario)) {
      assert.notEqual(result.status, 0); assert.deepEqual(writes, []);
    } else {
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(calls.slice(0, 2).map(row => row[0]), ['view', 'view']);
      assert.equal(writes.length, packages.length);
      assert(writes.every(row => row[0] === (scenario === 'new' ? 'publish' : 'dist-tag')));
      if (scenario === 'new') assert(writes.every(row => row.includes('--provenance') && row.includes('--ignore-scripts')));
    }
  });
}
