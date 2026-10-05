// Assemble once, pack once, and carry these exact tarballs through tests/release.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [out] = process.argv.slice(2);
assert(out && process.env.npm_execpath, 'Run npm run ci:pack -- OUTPUT');
const root = resolve(out), packages = join(root, 'packages'), tarballs = join(root, 'tarballs');
mkdirSync(tarballs, { recursive: true });
execFileSync(process.execPath, ['scripts/package-targets.mjs', `--out=${packages}`, `--wasm=${process.env.GROVEDOM_WASM_BUILD_DIR}`, `--native=${process.env.GROVEDOM_BUILD_DIR}`, '--publishable'], { stdio: 'inherit' });
execFileSync(process.execPath, ['scripts/check-package-types.mjs', packages], { stdio: 'inherit' });
const records = [];
for (const name of ['grovedom', 'grovedom-native']) {
  const result = JSON.parse(execFileSync(process.execPath, [process.env.npm_execpath, 'pack', '--ignore-scripts', '--json', '--pack-destination', tarballs], { cwd: join(packages, name), encoding: 'utf8' }))[0];
  assert.equal(result.name, name);
  for (const { path } of result.files) {
    assert(!/(?:^|\/)(?:AGENTS\.md|CLAUDE\.md|\.codex|node_modules|diagnostics|test|bench|build\.json)(?:\/|$)/.test(path), `Unshippable file ${path}`);
    assert(/^(?:src\/|licenses\/|package\.json$|README\.md$|LICENSE$|THIRD_PARTY_NOTICES\.md$|grovedom\.(?:wasm|node)$)/.test(path), `Unexpected package file ${path}`);
  }
  const bytes = readFileSync(join(tarballs, result.filename));
  assert.equal(result.integrity, 'sha512-' + createHash('sha512').update(bytes).digest('base64'));
  records.push({ name, version: result.version, file: result.filename, integrity: result.integrity,
    sha256: createHash('sha256').update(bytes).digest('hex') });
}
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
writeFileSync(join(tarballs, 'release.json'), JSON.stringify({ commit, packages: records }, null, 2) + '\n');
writeFileSync(join(tarballs, 'SHA256SUMS'), records.map(row => `${row.sha256}  ${row.file}\n`).join(''));
console.log('Created checked tarballs for installation tests and manual release.');
