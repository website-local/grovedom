// Compile real package imports outside the workspace so development dependencies
// cannot accidentally satisfy declaration imports. No installs or network calls.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const packages = process.argv[2];
if (!packages || !process.env.TMPDIR)
  throw new Error('Set TMPDIR and pass the directory containing the assembled packages.');
const require = createRequire(import.meta.url);
const compiler = process.env.GROVEDOM_TSC ?? require.resolve('typescript/bin/tsc');
const standardLibrary = resolve(dirname(realpathSync(compiler)), '../lib') + sep;
const project = mkdtempSync(join(process.env.TMPDIR, 'package-types-'));
const modules = join(project, 'node_modules');
mkdirSync(modules);
for (const name of ['grovedom', 'grovedom-native']) {
  const source = resolve(packages, name);
  const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies'])
    assert.equal(Object.keys(manifest[field] ?? {}).length, 0, `${name} has ${field}`);
  cpSync(source, join(modules, name), { recursive: true,
    filter: path => !path.slice(source.length).split(sep).includes('node_modules') });
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const target of ['node', 'browser']) {
  const fixture = join(project, `${target}.mts`);
  copyFileSync(join(root, 'test', `${target}-package-types.ts`), fixture);
  const config = join(project, `${target}.json`);
  writeFileSync(config, JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext',
    lib: ['ES2022', 'DOM'], types: [], strict: true, noEmit: true, skipLibCheck: false,
    ...(target === 'browser' ? { customConditions: ['browser'] } : {}),
  }, files: [fixture] }));
  const result = spawnSync(process.execPath, [compiler, '--project', config, '--listFiles'], {
    encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  // Also reject successful resolution to a dependency in an ancestor directory.
  for (const path of result.stdout.trim().split(/\r?\n/)) {
    const file = realpathSync(path);
    assert(file.startsWith(project + sep) || file.startsWith(standardLibrary),
      `Unexpected external declaration: ${file}`);
  }
}
console.log('Standalone Node/native/browser package declarations pass without third-party types.');
