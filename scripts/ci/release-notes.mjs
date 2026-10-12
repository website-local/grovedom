import assert from 'node:assert/strict';

export function releaseNotes(changelog, version) {
  const lines = changelog.split(/\r?\n/);
  const matches = lines.flatMap((line, index) =>
    line === `## ${version}` || line === `## ${version} (unreleased)` ? [index] : []);
  assert.equal(matches.length, 1, 'Expected one changelog entry for the release version');
  const start = matches[0] + 1;
  let end = lines.findIndex((line, index) => index >= start && line.startsWith('## '));
  if (end < 0) end = lines.length;
  const body = lines.slice(start, end).join('\n').trim();
  assert(body, 'Release notes must not be empty');
  return body;
}
