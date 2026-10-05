import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { testPlan } from './test-plan.mjs';

const [scope, install, tarballs] = process.argv.slice(2);
const checks = testPlan(scope, install);
assert(scope === 'portable' || process.platform === 'linux', 'Native CI tests require Linux');
assert(install === 'none' || tarballs, 'Pass the tested tarball directory');
const files = readdirSync('test').filter(name => name.endsWith('.test.mjs')).sort().map(name => join('test', name));
assert(files.length, 'No test files found');
const failures = [];
for (const check of checks) {
  const env = { ...process.env, GROVEDOM_BACKEND: check.backend ?? 'wasm', GROVEDOM_WASM_HEAP: check.heap ?? 'pool' };
  let args;
  switch (check.kind) {
    case 'suite': args = ['--test', '--test-concurrency=1', ...files]; break;
    case 'types': args = ['scripts/check-types.mjs']; break;
    case 'fuzz':
      env.GROVEDOM_FUZZ_CASES = String(check.cases);
      env.GROVEDOM_FUZZ_DIR = join(process.env.GROVEDOM_FUZZ_DIR, check.backend);
      args = ['test/fuzz.mjs']; break;
    case 'browser':
      if (check.fallback) env.GROVEDOM_BROWSER_FALLBACK = '1';
      else delete env.GROVEDOM_BROWSER_FALLBACK;
      args = ['--experimental-vm-modules', 'test/browser-sandbox.mjs']; break;
    case 'install': args = ['scripts/ci/install.mjs', tarballs, check.target]; break;
    default: throw new Error('Unknown check');
  }
  const label = Object.values(check).join(' / ');
  console.log(`::group::${label}`);
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.error || result.status !== 0) {
    failures.push(label);
    console.error(result.error ?? `Check failed (${result.status ?? result.signal})`);
  }
  console.log('::endgroup::');
}
if (failures.length) {
  console.error('Failed checks: ' + failures.join(', '));
  process.exitCode = 1;
}
