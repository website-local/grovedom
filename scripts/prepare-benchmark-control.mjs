import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Every helper needs its own module URL: query strings on an entry do not
// propagate to relative imports, allowing V8 feedback to cross between facades.
// Callers initialize this source copy with the original package's Wasm bytes/URL.
export function prepareBenchmarkControl(packageRoot, output) {
  const source = resolve(packageRoot), destination = resolve(output);
  assert(existsSync(join(source, 'src/browser.js')), 'Expected a GroveDOM browser package');
  assert(!existsSync(destination), 'Benchmark control output must be a new directory');
  mkdirSync(destination, { recursive: true });
  cpSync(join(source, 'src'), join(destination, 'src'), { recursive: true, dereference: true });
  cpSync(join(source, 'LICENSE'), join(destination, 'LICENSE'));
  writeFileSync(join(destination, 'package.json'), JSON.stringify({ private: true, type: 'module' }, null, 2) + '\n');
  return join(destination, 'src/browser.js');
}
