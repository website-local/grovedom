import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = 'https://api.github.com/repos/website-local/grovedom';
async function request(url, accept = 'application/vnd.github+json') {
  return fetch(url, { headers: {
    ...(process.env.GH_TOKEN ? { Authorization: `Bearer ${process.env.GH_TOKEN}` } : {}),
    Accept: accept, 'X-GitHub-Api-Version': '2022-11-28',
  } });
}
export async function githubRelease(tag) {
  const response = await request(`${base}/releases/tags/${tag}`);
  if (response.status !== 404) {
    assert(response.ok, `GitHub release lookup failed: HTTP ${response.status}`);
    return response.json();
  }
  // GitHub's tag endpoint can omit drafts whose tag has not been created yet.
  let url = `${base}/releases?per_page=100`;
  while (url) {
    const page = await request(url);
    assert(page.ok, `GitHub draft lookup failed: HTTP ${page.status}`);
    const release = (await page.json()).find(row => row.tag_name === tag);
    if (release) return release;
    url = page.headers.get('link')?.match(/<([^>]+)>; rel="next"/)?.[1];
  }
  return null;
}
export async function verifyReleaseTarget(release, tag, commit) {
  if (release) assert.equal(release.tag_name, tag, 'Unexpected release tag');
  const response = await request(`${base}/git/ref/tags/${encodeURIComponent(tag)}`);
  if (response.status === 404) {
    // An unpublished draft may not have a Git tag yet. Pin its future target.
    if (release) assert(release.draft && release.target_commitish === commit,
      'Release without a Git tag must be a draft targeting the tested commit');
    return;
  }
  assert(response.ok, `GitHub tag lookup failed: HTTP ${response.status}`);
  let { object } = await response.json();
  const seen = new Set();
  while (object?.type === 'tag') {
    assert(seen.size < 16 && !seen.has(object.sha), 'Invalid annotated tag chain');
    seen.add(object.sha);
    const tagResponse = await request(`${base}/git/tags/${object.sha}`);
    assert(tagResponse.ok, `GitHub annotated tag lookup failed: HTTP ${tagResponse.status}`);
    ({ object } = await tagResponse.json());
  }
  assert(object?.type === 'commit' && object.sha === commit,
    'Release Git tag differs from the tested commit');
}
export async function verifyAssets(release, directory, names) {
  const missing = [], digest = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const name of names) {
    const asset = release.assets.find(row => row.name === name);
    if (!asset) { missing.push(name); continue; }
    const response = await request(asset.url, 'application/octet-stream');
    assert(response.ok, `Asset download failed: HTTP ${response.status}`);
    assert.equal(digest(Buffer.from(await response.arrayBuffer())), digest(readFileSync(join(directory, name))), `Existing asset differs: ${name}`);
  }
  return missing;
}
