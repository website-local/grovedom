import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readRelease } from './artifacts.mjs';
import { githubRelease, verifyReleaseTarget, verifyAssets } from './github-api.mjs';

const root = resolve(process.argv[2]), version = process.env.RELEASE_VERSION;
const manifest = readRelease(root, version, process.env.GITHUB_SHA), tag = `v${version}`;
const names = [...manifest.packages.map(row => row.file), 'SHA256SUMS', 'release.json'];
function gh(args) { execFileSync('gh', args, { stdio: 'inherit' }); }
const release = await githubRelease(tag);
await verifyReleaseTarget(release, tag, manifest.commit);
if (!release) {
  // gh keeps the new release ID, uploads into a draft, then publishes it. Do not
  // rediscover a fresh draft through tag/list endpoints that may not expose it.
  const notes = `Experimental GroveDOM release.\n\nThe main package uses Wasm on Node and shares its binary with the best-effort browser entry. The optional native package requires Linux x64 with glibc 2.35 or later.\n\nnpm selection for this run: ${process.env.NPM_PACKAGES}. See [release and installation instructions](https://github.com/website-local/grovedom/blob/${manifest.commit}/docs/releasing.md).\n`;
  const notesFile = join(process.env.RUNNER_TEMP, 'release-notes.md');
  writeFileSync(notesFile, notes);
  gh(['release', 'create', tag, ...names.map(name => join(root, name)),
    '--target', manifest.commit, '--title', tag, '--notes-file', notesFile,
    ...(version.includes('-') ? ['--prerelease'] : [])]);
} else {
  // Resume an existing draft or incomplete manual release without overwrites.
  const missing = await verifyAssets(release, root, names);
  if (missing.length) gh(['release', 'upload', tag, ...missing.map(name => join(root, name))]);
  if (release.draft) gh(['release', 'edit', tag, '--draft=false']);
}
console.log('GitHub release contains the tested artifacts.');
