import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { releaseOptions } from './release-options.mjs';

const options = releaseOptions(process.env.RELEASE_VERSION, process.env.NPM_TAG, process.env.NPM_PACKAGES, process.env.NPM_AUTH);
assert.equal(process.env.GITHUB_REF, 'refs/heads/main', 'Release only from main');
assert.equal(process.env.GITHUB_REPOSITORY, 'website-local/grovedom', 'Release only from the upstream repository');
for (const path of ['package.json', 'packages/native/package.json'])
  assert.equal(JSON.parse(readFileSync(path)).version, options.version, 'Commit matching package versions before releasing');
const lock = JSON.parse(readFileSync('package-lock.json'));
assert.equal(lock.version, options.version, 'Update the lockfile version');
assert.equal(lock.packages[''].version, options.version, 'Update the lockfile root version');
const tags = execFileSync('git', ['ls-remote', '--tags', 'origin', `refs/tags/${options.gitTag}`, `refs/tags/${options.gitTag}^{}`], { encoding: 'utf8' }).trim();
if (tags) {
  const rows = tags.split('\n').map(line => line.split(/\s+/));
  const commit = rows.find(row => row[1].endsWith('^{}'))?.[0] ?? rows[0][0];
  assert.equal(commit, process.env.GITHUB_SHA, 'Existing release tag points to a different commit');
}
appendFileSync(process.env.GITHUB_OUTPUT, `version=${options.version}\ntag=${options.gitTag}\nprerelease=${options.prerelease}\n`);
