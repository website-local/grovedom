import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { releaseNotes } from '../scripts/ci/release-notes.mjs';

test('release notes select exactly the requested version and preserve subsections', () => {
  const changelog = '# Changelog\r\n\r\n## 0.1.10\r\nLater\r\n\r\n## 0.1.1 (unreleased)\r\nFixes.\r\n\r\n### Details\r\nKeep this.\r\n\r\n## 0.1.0\r\nEarlier\r\n';
  assert.equal(releaseNotes(changelog, '0.1.1'), 'Fixes.\n\n### Details\nKeep this.');
  assert.equal(releaseNotes(changelog, '0.1.0'), 'Earlier');
  assert.throws(() => releaseNotes(changelog, '0.2.0'), /one changelog entry/);
  assert.throws(() => releaseNotes(changelog + '\n## 0.1.1\nDuplicate', '0.1.1'), /one changelog entry/);
  assert.throws(() => releaseNotes('## 0.1.1\n\n## 0.1.0\nOld', '0.1.1'), /empty/);
});

test('the committed version has reviewed release notes', () => {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)));
  assert(releaseNotes(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8'), version).length > 0);
});
