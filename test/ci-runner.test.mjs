import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { mockProcessEnv } from './mock-process.mjs';

test('grouped CI continues independent checks after failure and still fails the job', t => {
  const root = mkdtempSync(join(tmpdir(), 'grovedom-ci-runner-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'test'));
  mkdirSync(join(root, 'scripts/ci'), { recursive: true });
  const log = join(root, 'checks.jsonl');
  function script(path, expression, tail = '') {
    writeFileSync(join(root, path), `import { appendFileSync } from 'node:fs';
appendFileSync(process.env.CI_CHECK_LOG, JSON.stringify(${expression}) + '\\n');
${tail}\n`);
  }
  script('test/mock.test.mjs', "['suite', process.env.GROVEDOM_BACKEND, process.env.GROVEDOM_WASM_HEAP]",
    "if (process.env.GROVEDOM_BACKEND === 'wasm' && process.env.GROVEDOM_WASM_HEAP === 'pool') throw Error('intentional failure');");
  script('test/fuzz.mjs', "['fuzz', process.env.GROVEDOM_BACKEND, process.env.GROVEDOM_FUZZ_CASES]");
  script('test/browser-sandbox.mjs', "['browser', process.env.GROVEDOM_BROWSER_FALLBACK ?? 'normal']");
  script('scripts/check-types.mjs', "['types']");
  script('scripts/ci/install.mjs', "['install', process.argv[3]]");
  const full = process.platform === 'linux';
  const env = mockProcessEnv({ CI_CHECK_LOG: log,
    GROVEDOM_FUZZ_DIR: join(root, 'fuzz'), GROVEDOM_BROWSER_FALLBACK: '1' });
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/ci/test.mjs', import.meta.url)),
    full ? 'all-heaps' : 'portable', 'wasm', 'tarballs'], {
    cwd: root, encoding: 'utf8', env,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1, `signal=${result.signal}\n${result.stdout}\n${result.stderr}`);
  assert.match(result.stderr, /Failed checks: suite \/ wasm \/ pool/);
  const checks = readFileSync(log, 'utf8').trim().split('\n').map(JSON.parse);
  assert.deepEqual(checks.filter(row => row[0] === 'suite'), full
    ? [['suite', 'wasm', 'pool'], ['suite', 'wasm', 'global'], ['suite', 'wasm', 'document'], ['suite', 'napi', 'pool']]
    : [['suite', 'wasm', 'pool']]);
  assert.deepEqual(checks.filter(row => row[0] === 'browser'), [['browser', 'normal'], ['browser', '1']]);
  if (full) {
    assert.deepEqual(checks.filter(row => row[0] === 'fuzz'), [['fuzz', 'wasm', '200'], ['fuzz', 'napi', '200']]);
    assert.equal(checks.filter(row => row[0] === 'types').length, 1);
  }
  assert.deepEqual(checks.at(-1), ['install', 'wasm']);
});
