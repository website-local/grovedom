import { spawnSync } from 'node:child_process';
const configurations = [
  { backend: 'napi', heap: 'global' },
  { backend: 'wasm', heap: 'global' },
  { backend: 'wasm', heap: 'document' },
  { backend: 'wasm', heap: 'pool' },
];
const results = [];
for (const { backend, heap } of configurations) {
  const result = spawnSync(process.execPath, [new URL('./run.mjs', import.meta.url).pathname], {
    env: { ...process.env, GROVEDOM_BACKEND: backend, GROVEDOM_WASM_HEAP: heap },
    encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || `Benchmark exited ${result.status}`);
  results.push(JSON.parse(result.stdout));
}
console.log(JSON.stringify({ scope: 'separate processes; compare against the baselines within each run', results }, null, 2));
