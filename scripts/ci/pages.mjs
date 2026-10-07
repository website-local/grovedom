// Reuse a release's exact JS/Wasm pair. This command neither builds nor publishes.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readRelease } from './artifacts.mjs';
import { releaseOptions } from './release-options.mjs';

const [directory, source, output, tag, expectedCommit] = process.argv.slice(2);
assert(directory && source && output && tag?.startsWith('v'),
  'Use pages.mjs TARBALLS RELEASE_CHECKOUT NEW_OUTPUT vVERSION [EXPECTED_COMMIT]');
const { version } = releaseOptions(tag.slice(1), 'next', 'none', 'oidc');
const checkout = resolve(source), out = resolve(output), tarballs = resolve(directory);
const commit = execFileSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert(/^[a-f0-9]{40}$/.test(commit), 'Expected a release commit');
if (expectedCommit) assert.equal(commit, expectedCommit, 'Release tag differs from the tested commit');
assert.equal(JSON.parse(readFileSync(join(checkout, 'package.json'))).version, version);
const manifest = readRelease(tarballs, version, commit);
const wasm = manifest.packages.find(row => row.name === 'grovedom');
const archive = join(tarballs, wasm.file);

// Reject unexpected archive paths before extracting into a new directory.
const entries = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
for (const entry of entries) {
  assert(entry.startsWith('package/') && !entry.includes('\\') && !entry.split('/').includes('..'),
    'Unexpected package archive path');
}
assert(!existsSync(out), 'Pages output must be a new directory');
const pkg = join(out, 'grovedom');
mkdirSync(pkg, { recursive: true });
execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', pkg, '--no-same-owner']);
const packageInfo = JSON.parse(readFileSync(join(pkg, 'package.json')));
assert.equal(packageInfo.name, 'grovedom');
assert.equal(packageInfo.version, version);
const module = new WebAssembly.Module(readFileSync(join(pkg, 'grovedom.wasm')));
assert.equal(WebAssembly.Module.imports(module).length, 0, 'Release Wasm must be import-free');
assert(!WebAssembly.Module.exports(module).some(({ name }) => /profile|__stack/.test(name)), 'Diagnostic Wasm exports');
mkdirSync(join(out, 'demo'));
for (const name of ['index.html', 'benchmark.js', 'comparison.js', 'workload.js', 'xml-workload.js']) {
  // Earlier releases have a self-contained benchmark module.
  if (['comparison.js', 'workload.js', 'xml-workload.js'].includes(name) && !existsSync(join(checkout, 'demo', name))) continue;
  cpSync(join(checkout, 'demo', name), join(out, 'demo', name));
}
writeFileSync(join(out, 'index.html'), `<!doctype html>
<html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="0;url=./demo/">
<title>GroveDOM ${tag} browser demo</title>
<p><a href="./demo/">Open the GroveDOM ${tag} browser benchmark</a>.</p>
</html>
`);
writeFileSync(join(out, 'release.json'), JSON.stringify({ version, commit, sha256: wasm.sha256 }, null, 2) + '\n');
console.log(`Prepared browser demo for ${tag} (${commit}).`);
