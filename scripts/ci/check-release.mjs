import assert from 'node:assert/strict';
import { readRelease } from './artifacts.mjs';
import { githubRelease, verifyReleaseTarget, verifyAssets } from './github-api.mjs';

const manifest = readRelease(process.argv[2], process.env.RELEASE_VERSION, process.env.GITHUB_SHA);
const release = await githubRelease(`v${process.env.RELEASE_VERSION}`);
await verifyReleaseTarget(release, `v${process.env.RELEASE_VERSION}`, manifest.commit);
if (release) {
  const missing = await verifyAssets(release, process.argv[2], [...manifest.packages.map(row => row.file), 'SHA256SUMS', 'release.json']);
  assert(release.draft || !missing.length, 'Published release is missing assets; rerun its failed upload job');
}
console.log('Release artifacts verified; any existing GitHub release matches.');
