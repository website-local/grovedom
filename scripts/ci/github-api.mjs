import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = 'https://api.github.com/repos/website-local/grovedom';
async function request(url, accept = 'application/vnd.github+json') {
  return fetch(url, { headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: accept } });
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
    const release = (await page.json()).find(row => row.draft && row.tag_name === tag);
    if (release) return release;
    url = page.headers.get('link')?.match(/<([^>]+)>; rel="next"/)?.[1];
  }
  return null;
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
