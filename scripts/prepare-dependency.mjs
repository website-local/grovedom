import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sourceFingerprint } from './source-fingerprint.mjs';

// Verify the upstream input, patch bytes, and complete patched tree. Never edit
// the caller's shared dependency source; every build owns its prepared copy.
export function prepareDependency(source, build, manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (!source || sourceFingerprint(source) !== manifest.sourceTreeSha256)
    throw new Error('Lexbor source differs from the reviewed upstream tree.');
  if (!manifest.patches?.length) return resolve(source);
  // Resolve the existing ancestor too, so a symlink cannot put staging inside
  // the pristine input. Check before creating any build directory.
  let ancestor = resolve(build);
  while (!existsSync(ancestor)) ancestor = dirname(ancestor);
  const canonicalBuild = resolve(realpathSync(ancestor), relative(ancestor, resolve(build)));
  const within = relative(realpathSync(source), canonicalBuild);
  if (!within || (!isAbsolute(within) && within !== '..' && !within.startsWith(`..${sep}`)))
    throw new Error('The dependency build directory must be outside the upstream source.');
  if (!/^[a-f0-9]{64}$/.test(manifest.patchedTreeSha256))
    throw new Error('Missing reviewed patched Lexbor tree fingerprint.');
  const patches = manifest.patches.map(patch => {
    if (!/^patches\/[a-z0-9-]+\.patch$/.test(patch.file)) throw new Error('Invalid dependency patch path.');
    const path = join(dirname(manifestPath), patch.file);
    const digest = createHash('sha256').update(readFileSync(path)).digest('hex');
    if (digest !== patch.sha256) throw new Error(`Dependency patch checksum differs: ${patch.file}`);
    return path;
  });
  const destination = join(build, `lexbor-source-${manifest.patchedTreeSha256}`);
  if (existsSync(destination)) {
    if (sourceFingerprint(destination) !== manifest.patchedTreeSha256)
      throw new Error('Prepared Lexbor source was modified; use a fresh build directory.');
    return destination;
  }
  mkdirSync(build, { recursive: true });
  const staging = mkdtempSync(join(build, 'lexbor-source-staging-'));
  try {
    cpSync(source, staging, { recursive: true, filter: path => !path.split(/[\\/]/).includes('.git') });
    for (const patch of patches) {
      for (const check of [true, false]) {
        const result = spawnSync('git', ['apply', '--whitespace=error', ...(check ? ['--check'] : []), patch], {
          cwd: staging, encoding: 'utf8', env: process.env,
        });
        if (result.error || result.status !== 0)
          throw new Error(`Cannot apply reviewed dependency patch: ${result.stderr}`, { cause: result.error });
      }
    }
    if (sourceFingerprint(staging) !== manifest.patchedTreeSha256)
      throw new Error('Patched Lexbor source differs from the reviewed tree.');
    renameSync(staging, destination);
    return destination;
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}
