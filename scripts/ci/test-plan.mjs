import assert from 'node:assert/strict';

// Group by OS and Node version; every runtime configuration still gets its own process.
export function testPlan(scope, install) {
  assert(['linux', 'all-heaps', 'portable'].includes(scope), 'Unknown test scope');
  assert(['none', 'wasm', 'both'].includes(install), 'Unknown installation target');
  const configurations = [{ backend: 'wasm', heap: 'pool' }];
  if (scope === 'all-heaps') configurations.push({ backend: 'wasm', heap: 'global' }, { backend: 'wasm', heap: 'document' });
  if (scope !== 'portable') configurations.push({ backend: 'napi', heap: 'pool' });
  const checks = configurations.map(config => ({ kind: 'suite', ...config }));
  if (scope === 'all-heaps') {
    checks.push({ kind: 'types' });
    for (const backend of ['wasm', 'napi']) checks.push({ kind: 'fuzz', backend, heap: 'pool', cases: 200 });
  }
  checks.push({ kind: 'browser', fallback: false }, { kind: 'browser', fallback: true });
  if (install !== 'none') checks.push({ kind: 'install', target: install });
  return checks;
}
