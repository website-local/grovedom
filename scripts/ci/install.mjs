// Install real tarballs into an empty consumer without development dependencies.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRelease } from './artifacts.mjs';

const [directory, target = 'wasm'] = process.argv.slice(2);
assert(directory && ['wasm', 'both'].includes(target) && process.env.TMPDIR && process.env.npm_execpath, 'Run npm run ci:install -- TARBALLS wasm|both with TMPDIR');
const root = resolve(directory);
const source = new URL('../../', import.meta.url);
const version = JSON.parse(readFileSync(new URL('package.json', source))).version;
const commit = process.env.GITHUB_SHA ?? execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: fileURLToPath(source), encoding: 'utf8',
}).trim();
// Fail before npm or filesystem setup if these are not the reviewed artifacts.
const manifest = readRelease(root, version, commit);
const consumer = mkdtempSync(join(process.env.TMPDIR, 'grovedom-consumer-'));
writeFileSync(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');
const names = target === 'both' ? ['grovedom', 'grovedom-native'] : ['grovedom'];
const tarballs = names.map(name => join(root, manifest.packages.find(row => row.name === name).file));
execFileSync(process.execPath, [process.env.npm_execpath, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs], { cwd: consumer, stdio: 'inherit' });
assert(!existsSync(join(consumer, 'node_modules/cheerio')));
for (const name of names) {
  const installed = JSON.parse(readFileSync(join(consumer, 'node_modules', name, 'package.json')));
  assert.equal(installed.version, version);
  for (const key of ['dependencies', 'peerDependencies', 'optionalDependencies'])
    assert.equal(Object.keys(installed[key] ?? {}).length, 0, `${name} has ${key}`);
}
for (const file of ['package-contract.mjs', 'package-consumer.mjs', 'package-consumer-worker.mjs'])
  copyFileSync(new URL(`test/${file}`, source), join(consumer, file));
execFileSync(process.execPath, ['package-consumer.mjs', target], { cwd: consumer, stdio: 'inherit' });
