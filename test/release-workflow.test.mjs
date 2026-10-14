import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

// Exercise the workflow's actual condition with completed, skipped and cancelled
// dependency results. No workflow dispatch or publication occurs in these tests.
const source = readFileSync(new URL('../.github/workflows/release.yml', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const job = source.split('\n  github:\n')[1].split('\n  pages:\n')[0];
const condition = /^    if: ([^\n]+)(?:\n((?:      [^\n]*\n)*))?/m.exec(job);
assert(condition, 'GitHub publication condition is missing');
const expression = (condition[1] === '>-' ? condition[2] : condition[1]).trim().replace(/^\$\{\{\s*|\s*\}\}$/g, '');
function mayPublish({ cancelled = false, artifacts = 'success', packages = 'none', npm = 'skipped' } = {}) {
  return runInNewContext(expression, {
    cancelled: () => cancelled, always: () => true,
    inputs: { npm_packages: packages }, needs: { artifacts: { result: artifacts }, npm: { result: npm } },
  });
}

test('cancelled releases cannot publish GitHub assets', () => {
  assert.equal(mayPublish({ cancelled: true }), false);
  assert.equal(mayPublish({ cancelled: true, packages: 'both', npm: 'success' }), false);
});

test('GitHub publication requires artifacts and every requested npm publication', () => {
  assert.equal(mayPublish(), true);
  for (const packages of ['wasm', 'both']) {
    assert.equal(mayPublish({ packages, npm: 'success' }), true);
    for (const npm of ['skipped', 'failure', 'cancelled']) assert.equal(mayPublish({ packages, npm }), false);
  }
  for (const artifacts of ['skipped', 'failure', 'cancelled']) assert.equal(mayPublish({ artifacts }), false);
});
