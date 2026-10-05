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

for (const scenario of ['new', 'partial', 'published', 'mismatch']) {
  test(`GitHub release ${scenario}: publishes only complete matching assets`, { skip: process.platform === 'win32' }, t => {
    const { root, packages } = fixture(t), bin = join(root, 'bin');
    mkdirSync(bin);
    writeFileSync(join(root, 'package.json'), '{"type":"commonjs"}');
    const names = [...packages.map(row => row.file), 'SHA256SUMS', 'release.json'];
    const present = scenario === 'partial' ? names.slice(0, 1) : names;
    const state = { calls: [], payloads: Object.fromEntries(present.map(name => [name, readFileSync(join(root, name)).toString('base64')])),
      release: scenario === 'new' ? null : { tag_name: `v${version}`, target_commitish: commit, draft: scenario === 'partial',
        assets: present.map(name => ({ name, url: `https://api.github.com/mock/${name}` })) } };
    if (scenario === 'mismatch') state.payloads[names[0]] = Buffer.from('different bytes').toString('base64');
    const stateFile = join(root, 'state.json');
    writeFileSync(stateFile, JSON.stringify(state));
    const preload = join(root, 'fetch.mjs');
    writeFileSync(preload, `
import fs from 'node:fs';
globalThis.fetch = async url => {
  const state = JSON.parse(fs.readFileSync(process.env.MOCK_STATE));
  if (url.includes('/releases/tags/')) return Response.json(state.release, {status: state.release && !state.release.draft ? 200 : 404});
  if (url.includes('/releases?')) return Response.json(state.release ? [state.release] : []);
  const name = new URL(url).pathname.split('/').pop();
  if (!(name in state.payloads)) throw new Error('Unexpected network request');
  return new Response(Buffer.from(state.payloads[name], 'base64'));
};
`);
    writeFileSync(join(bin, 'gh'), `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2), file = process.env.MOCK_STATE, state = JSON.parse(fs.readFileSync(file));
state.calls.push(args);
if (args[1] === 'create') state.release = {tag_name:args[2], target_commitish:args[args.indexOf('--target')+1], draft:true, assets:[]};
if (args[1] === 'upload') for (const file of args.slice(3)) {
  const name = path.basename(file);
  if (state.release.assets.some(asset => asset.name === name)) throw new Error('Must not overwrite assets');
  state.release.assets.push({name,url:'https://api.github.com/mock/'+name});
  state.payloads[name] = fs.readFileSync(file).toString('base64');
}
if (args[1] === 'edit') { if (state.release.assets.length !== 4) throw new Error('Incomplete release'); state.release.draft = false; }
fs.writeFileSync(file,JSON.stringify(state));
`, { mode: 0o755 });
    const result = spawnSync(process.execPath, ['--import', preload, fileURLToPath(new URL('../scripts/ci/github-release.mjs', import.meta.url)), root], {
      encoding: 'utf8', env: mockProcessEnv({ PATH: bin + delimiter + process.env.PATH,
        RELEASE_VERSION: version, GITHUB_SHA: commit, RUNNER_TEMP: root, NPM_PACKAGES: 'none', MOCK_STATE: stateFile }),
    });
    assert.ifError(result.error);
    assert.equal(result.signal, null, result.stderr);
    const after = JSON.parse(readFileSync(stateFile));
    if (scenario === 'mismatch') {
      assert.notEqual(result.status, 0); assert.deepEqual(after.calls, []);
    } else {
      assert.equal(result.status, 0, result.stderr);
      assert.equal(after.release.draft, false); assert.equal(after.release.assets.length, 4);
      if (scenario === 'published') assert.deepEqual(after.calls, []);
      if (scenario === 'partial') assert.equal(after.calls[0].slice(3).length, 3);
    }
  });
}
