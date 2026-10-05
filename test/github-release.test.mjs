import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, chmodSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, delimiter } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mockProcessEnv } from './mock-process.mjs';

const commit = 'a'.repeat(40), wrongCommit = 'b'.repeat(40);
function fixture(t, scenario, version = '0.1.0') {
  const root = mkdtempSync(join(tmpdir(), 'grovedom-github-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  copyFileSync(new URL('./github-cli-fixture.mjs', import.meta.url), join(bin, 'gh'));
  chmodSync(join(bin, 'gh'), 0o755);
  // Exercise module specifiers with characters requiring URL encoding on every OS.
  const preload = join(root, 'github fixture #%.mjs');
  copyFileSync(new URL('./github-fixture.mjs', import.meta.url), preload);
  const packages = ['grovedom', 'grovedom-native'].map(name => {
    const bytes = Buffer.from(name), file = `${name}-${version}.tgz`;
    writeFileSync(join(root, file), bytes);
    return { name, version, file, sha256: createHash('sha256').update(bytes).digest('hex'),
      integrity: 'sha512-' + createHash('sha512').update(bytes).digest('base64') };
  });
  writeFileSync(join(root, 'release.json'), JSON.stringify({ commit, packages }));
  writeFileSync(join(root, 'SHA256SUMS'), packages.map(row => `${row.sha256}  ${row.file}\n`).join(''));
  const names = [...packages.map(row => row.file), 'SHA256SUMS', 'release.json'];
  const fresh = ['new', 'hidden-new', 'upload-failure', 'tag-only-mismatch'].includes(scenario);
  const draft = ['partial', 'partial-failure', 'paginated', 'draft-mismatch'].includes(scenario);
  const present = fresh ? [] : draft || scenario === 'published-incomplete' ? names.slice(0, 1) : names;
  const state = { scenario, commit, failOnce: true, requests: [], calls: [],
    payloads: Object.fromEntries(present.map(name => [name, readFileSync(join(root, name)).toString('base64')])),
    tag: fresh || draft ? null : { type: 'commit', sha: commit },
    release: fresh ? null : { id: 7, tag_name: `v${version}`, target_commitish: scenario === 'branch-target' ? 'main' : commit,
      draft, assets: present.map(name => ({ name, url: `https://api.github.com/repos/website-local/grovedom/releases/assets/${name}` })) } };
  if (scenario === 'asset-mismatch') state.payloads[names[0]] = Buffer.from('different').toString('base64');
  if (scenario === 'draft-mismatch') state.release.target_commitish = wrongCommit;
  if (['tag-mismatch', 'tag-only-mismatch'].includes(scenario)) state.tag = { type: 'commit', sha: wrongCommit };
  if (['annotated', 'annotated-mismatch', 'tag-cycle'].includes(scenario)) {
    state.tag = { type: 'tag', sha: 'c'.repeat(40) };
    state.annotation = scenario === 'tag-cycle' ? state.tag : { type: 'commit', sha: scenario === 'annotated' ? commit : wrongCommit };
  }
  const stateFile = join(root, 'state.json');
  writeFileSync(stateFile, JSON.stringify(state));
  return {
    state: () => JSON.parse(readFileSync(stateFile)),
    run(script = 'github-release') {
      const result = spawnSync(process.execPath, [
        '--import', pathToFileURL(preload).href,
        fileURLToPath(new URL(`../scripts/ci/${script}.mjs`, import.meta.url)), root,
      ], { encoding: 'utf8', env: mockProcessEnv({
        RELEASE_VERSION: version, GITHUB_SHA: commit, NPM_PACKAGES: 'both', MOCK_STATE: stateFile,
        RUNNER_TEMP: root, PATH: bin + delimiter + process.env.PATH,
      }) });
      assert.ifError(result.error);
      assert.equal(result.signal, null, result.stderr);
      return result;
    },
  };
}

for (const scenario of ['new', 'hidden-new', 'partial', 'paginated', 'published', 'published-list', 'branch-target', 'annotated', 'published-incomplete']) {
  test(`GitHub release ${scenario}: uses official CLI commands after verification`, { skip: process.platform === 'win32' }, t => {
    const f = fixture(t, scenario), result = f.run(), after = f.state();
    assert.equal(result.status, 0, result.stderr);
    assert.equal(after.release.draft, false);
    assert.equal(after.release.assets.length, 4);
    if (['published', 'published-list', 'branch-target', 'annotated'].includes(scenario)) assert.deepEqual(after.calls, []);
    if (['new', 'hidden-new'].includes(scenario)) {
      assert.equal(after.calls[0][0], 'create');
      assert.equal(after.calls[0][1].target_commitish, commit);
      assert.equal(after.calls[0][1].prerelease, false);
      assert.equal(after.calls.length, 1);
      // No rediscovery after create, even when the new draft would stay hidden.
      assert.equal(after.requests.filter(([method, path]) => method === 'GET' && /^\/releases(?:$|\/tags\/)/.test(path)).length, 2);
    }
    if (['partial', 'paginated', 'published-incomplete'].includes(scenario)) assert.equal(after.calls.find(row => row[0] === 'upload').length, 4);
  });
}

const failures = {
  'asset-mismatch': /Existing asset differs/,
  'tag-mismatch': /Git tag differs/,
  'tag-only-mismatch': /Git tag differs/,
  'annotated-mismatch': /Git tag differs/,
  'tag-cycle': /Invalid annotated tag chain/,
  'draft-mismatch': /draft targeting the tested commit/,
  'lookup-failure': /lookup failed: HTTP 503/,
};
for (const [scenario, error] of Object.entries(failures)) {
  for (const script of ['github-release', 'check-release']) {
    test(`${script} ${scenario}: rejects before any write`, t => {
      const f = fixture(t, scenario), result = f.run(script);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, error);
      assert.deepEqual(f.state().calls, []);
    });
  }
}

test('release preflight accepts a matching tag when target_commitish is a branch', t => {
  const f = fixture(t, 'branch-target'), result = f.run('check-release');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.state().calls, []);
});
test('release preflight rejects an incomplete published release before npm publication', t => {
  const f = fixture(t, 'published-incomplete'), result = f.run('check-release');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Published release is missing assets/);
  assert.deepEqual(f.state().calls, []);
});
test('failed new CLI release can be retried after its temporary draft is cleaned up', { skip: process.platform === 'win32' }, t => {
  const f = fixture(t, 'upload-failure'), first = f.run();
  assert.equal(first.status, 1, first.stderr);
  assert.match(first.stderr, /mock upload failure/);
  assert.equal(f.state().release, null);
  const retry = f.run(), after = f.state();
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(after.release.draft, false);
  assert.equal(after.calls.filter(row => row[0] === 'create').length, 2);
});
test('failed existing-draft upload is retried without clobbering earlier assets', { skip: process.platform === 'win32' }, t => {
  const f = fixture(t, 'partial-failure'), first = f.run();
  assert.equal(first.status, 1, first.stderr);
  assert.equal(f.state().release.draft, true);
  assert.equal(f.state().release.assets.length, 2);
  const retry = f.run();
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(f.state().release.draft, false);
  assert.deepEqual(f.state().calls.map(row => row[0]), ['upload', 'upload', 'publish']);
});
test('CLI creation marks prereleases explicitly', { skip: process.platform === 'win32' }, t => {
  const f = fixture(t, 'new', '0.1.1-alpha.1'), result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(f.state().calls[0][1].prerelease, true);
});
