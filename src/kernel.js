import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const backend = process.env.GROVEDOM_BACKEND ?? 'napi';
if (!['napi', 'wasm'].includes(backend)) throw new Error('Expected napi or wasm backend.');
function nativeKernel() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const build = resolve(process.env.GROVEDOM_BUILD_DIR ?? resolve(root, 'build/native'));
  const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
  const metadata = JSON.parse(readFileSync(resolve(build, 'build.json'), 'utf8'));
  if (metadata.packageVersion !== pkg.version) throw new Error('Rebuild GroveDOM: glue and kernel must come from the same package version.');
  return createRequire(import.meta.url)(resolve(build, 'grovedom.node'));
}
export const kernel = backend === 'wasm' ? (await import('./wasm-kernel.js')).kernel : nativeKernel();
