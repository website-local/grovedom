import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readRelease } from './artifacts.mjs';
import { githubRelease, verifyAssets } from './github-api.mjs';

const root = resolve(process.argv[2]), version = process.env.RELEASE_VERSION;
const manifest = readRelease(root, version, process.env.GITHUB_SHA), tag = `v${version}`;
function gh(args) { execFileSync('gh', args, { stdio: 'inherit' }); }
let release = await githubRelease(tag);
if (!release) {
  const notes = join(process.env.RUNNER_TEMP, 'release-notes.md');
  writeFileSync(notes, `Experimental GroveDOM release.\n\nThe main package uses Wasm on Node and shares its binary with the best-effort browser entry. The optional native package requires Linux x64 with glibc 2.35 or later.\n\nnpm selection for this run: ${process.env.NPM_PACKAGES}. See [release and installation instructions](https://github.com/website-local/grovedom/blob/${manifest.commit}/docs/releasing.md).\n`);
  gh(['release', 'create', tag, '--draft', '--target', manifest.commit, '--title', tag, '--notes-file', notes,
    ...(version.includes('-') ? ['--prerelease'] : [])]);
  release = await githubRelease(tag);
}
assert(release && release.target_commitish === manifest.commit, 'Release target differs from the tested commit');
const names = [...manifest.packages.map(row => row.file), 'SHA256SUMS', 'release.json'];
// A failed asset upload can be retried. Existing assets are verified, never clobbered.
const missing = await verifyAssets(release, root, names);
if (missing.length) gh(['release', 'upload', tag, ...missing.map(name => join(root, name))]);
if (release.draft) gh(['release', 'edit', tag, '--draft=false']);
console.log('GitHub release contains the tested artifacts.');
