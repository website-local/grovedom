import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let compiler = process.env.GROVEDOM_TSC;
if (!compiler) {
  try { compiler = require.resolve('typescript/bin/tsc'); }
  catch { throw new Error('Set GROVEDOM_TSC to an existing TypeScript compiler; this script installs no tools.'); }
}
const result = spawnSync(process.execPath, [compiler, '--project', 'test/tsconfig.json'], { stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
