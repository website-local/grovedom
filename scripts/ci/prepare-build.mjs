// GitHub-hosted Linux builders only. Downloads source/runtime libraries, not a compiler.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { sourceFingerprint } from '../source-fingerprint.mjs';

const [target] = process.argv.slice(2);
assert(['native', 'wasm'].includes(target), 'Pass native or wasm');
assert(process.env.RUNNER_TEMP && process.env.GITHUB_ENV, 'Requires GitHub runner paths');
const root = resolve(process.env.RUNNER_TEMP, 'grovedom');
mkdirSync(root, { recursive: true });
const dependency = JSON.parse(readFileSync('native/dependency.json'));
function download(url, file, sha256) {
  execFileSync('curl', ['--fail', '--location', '--silent', '--show-error', '--retry', '3', url, '--output', file], { stdio: 'inherit' });
  if (sha256) assert.equal(createHash('sha256').update(readFileSync(file)).digest('hex'), sha256, 'Download checksum');
  execFileSync('tar', ['-xzf', file, '-C', root], { stdio: 'inherit' });
}
download(dependency.archive, join(root, 'lexbor.tar.gz'));
const source = join(root, `lexbor-${dependency.revision}`);
assert.equal(sourceFingerprint(source), dependency.sourceTreeSha256, 'Lexbor source fingerprint');
const values = {
  TMPDIR: root, TMP: root, TEMP: root,
  GROVEDOM_LEXBOR_SOURCE: source,
  GROVEDOM_BUILD_DIR: join(root, 'native'),
  GROVEDOM_WASM_BUILD_DIR: join(root, 'wasm'),
  GROVEDOM_FAULT_BUILD_DIR: join(root, 'faults'),
};
if (target === 'wasm') {
  const release = 'https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-25/';
  download(release + 'wasi-sysroot-25.0.tar.gz', join(root, 'wasi.tar.gz'), 'd09c62c18efcddffe4b2fdd8c5830109cc8e36130cdbc9acdc0bd1b204c942bb');
  download(release + 'libclang_rt.builtins-wasm32-wasi-25.0.tar.gz', join(root, 'builtins.tar.gz'), '13aca55665321200b9659b292615adf5110ace9e891ab94511badd970553ca18');
  values.GROVEDOM_WASI_SYSROOT = join(root, 'wasi-sysroot-25.0');
  values.GROVEDOM_WASM_BUILTINS = join(root, 'libclang_rt.builtins-wasm32-wasi-25.0/libclang_rt.builtins-wasm32.a');
}
appendFileSync(process.env.GITHUB_ENV, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(''));
