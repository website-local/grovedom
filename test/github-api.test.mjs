import test from 'node:test';
import assert from 'node:assert/strict';
import { githubRelease } from '../scripts/ci/github-api.mjs';

const base = 'https://api.github.com/repos/website-local/grovedom';
test('release pagination recovers the URL after malformed opening delimiters', async t => {
  const next = `${base}/releases?per_page=100&page=2`, requests = [];
  const release = { tag_name: 'v0.1.0', draft: true };
  t.mock.method(globalThis, 'fetch', async url => {
    requests.push(url);
    if (url === `${base}/releases/tags/v0.1.0`) return { status: 404 };
    if (url === `${base}/releases?per_page=100`) return {
      ok: true, json: async () => [],
      headers: new Headers({ link: '<'.repeat(4096) + `${next}>; rel="next"` }),
    };
    assert.equal(url, next, 'Only the innermost delimited URL may be followed');
    return { ok: true, json: async () => [release] };
  });
  assert.deepEqual(await githubRelease('v0.1.0'), release);
  assert.equal(requests.length, 3);
});

test('release pagination stops on a long malformed header without a next link', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => ++requests === 1 ? { status: 404 } : {
    ok: true, json: async () => [],
    headers: new Headers({ link: '<'.repeat(16_384) + 'x>; rel="prev"' }),
  });
  assert.equal(await githubRelease('v0.1.0'), null);
  assert.equal(requests, 2);
});
