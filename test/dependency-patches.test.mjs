import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { prepareDependency } from '../scripts/prepare-dependency.mjs';
import { sourceFingerprint } from '../scripts/source-fingerprint.mjs';

for (const autocrlf of [undefined, 'true', 'false']) {
test(`dependency patches verify upstream, patch bytes and cached output without editing the input (${autocrlf ?? 'default'} autocrlf)`, t => {
  if (autocrlf !== undefined) {
    // Reproduce Windows/user Git settings without changing any config file.
    const overrides = { GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'core.autocrlf',
      GIT_CONFIG_VALUE_0: autocrlf, GIT_CONFIG_KEY_1: 'core.eol', GIT_CONFIG_VALUE_1: 'crlf' };
    const previous = Object.fromEntries(Object.keys(overrides).map(key => [key, process.env[key]]));
    t.after(() => { for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    } });
    Object.assign(process.env, overrides);
  }
  const root = mkdtempSync(join(tmpdir(), 'grovedom-dependency-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = join(root, 'source'), expected = join(root, 'expected'), build = join(root, 'build');
  for (const dir of [source, expected, join(root, 'patches')]) mkdirSync(dir);
  writeFileSync(join(source, 'example.c'), 'old\n');
  writeFileSync(join(expected, 'example.c'), 'new\n');
  const patch = 'diff --git a/example.c b/example.c\n--- a/example.c\n+++ b/example.c\n@@ -1 +1 @@\n-old\n+new\n';
  const patchPath = join(root, 'patches', 'example.patch');
  writeFileSync(patchPath, patch);
  const manifest = { sourceTreeSha256: sourceFingerprint(source), patchedTreeSha256: sourceFingerprint(expected),
    patches: [{ file: 'patches/example.patch', sha256: createHash('sha256').update(patch).digest('hex') }] };
  const manifestPath = join(root, 'dependency.json');
  writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.throws(() => prepareDependency(source, source, manifestPath), /outside the upstream source/);
  assert.throws(() => prepareDependency(source, join(source, 'nested', 'build'), manifestPath), /outside the upstream source/);
  const output = prepareDependency(source, build, manifestPath);
  assert.equal(readFileSync(join(output, 'example.c'), 'utf8'), 'new\n');
  assert.equal(readFileSync(join(source, 'example.c'), 'utf8'), 'old\n');
  assert.equal(prepareDependency(source, build, manifestPath), output);
  writeFileSync(patchPath, patch + '\n');
  assert.throws(() => prepareDependency(source, build, manifestPath), /patch checksum differs/);
  writeFileSync(patchPath, patch);
  writeFileSync(join(output, 'example.c'), 'tampered\n');
  assert.throws(() => prepareDependency(source, build, manifestPath), /Prepared Lexbor source was modified/);
  writeFileSync(join(source, 'example.c'), 'tampered\n');
  assert.throws(() => prepareDependency(source, build, manifestPath), /reviewed upstream tree/);
});
}
