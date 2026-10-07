import test from 'node:test';
import assert from 'node:assert/strict';
import { githubRelease } from '../scripts/ci/github-api.mjs';

const base = 'https://api.github.com/repos/website-local/grovedom';
function mockFetch(t, implementation) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'fetch', descriptor);
    else delete globalThis.fetch;
  });
  // The Node floor can expose fetch lazily; MockTracker.method requires an
  // existing value method. These tests supply the entire offline transport.
  Object.defineProperty(globalThis, 'fetch', { configurable: true, writable: true, value: implementation });
}
const linkHeaders = link => ({ get: name => name === 'link' ? link : null });
test('release pagination recovers the URL after malformed opening delimiters', async t => {
  const next = `${base}/releases?per_page=100&page=2`, requests = [];
  const release = { tag_name: 'v0.1.0', draft: true };
  mockFetch(t, async url => {
    requests.push(url);
    if (url === `${base}/releases/tags/v0.1.0`) return { status: 404 };
    if (url === `${base}/releases?per_page=100`) return {
      ok: true, json: async () => [],
      headers: linkHeaders('<'.repeat(4096) + `${next}>; rel="next"`),
    };
    assert.equal(url, next, 'Only the innermost delimited URL may be followed');
    return { ok: true, json: async () => [release] };
  });
  assert.deepEqual(await githubRelease('v0.1.0'), release);
  assert.equal(requests.length, 3);
});

test('release pagination stops on a long malformed header without a next link', async t => {
  let requests = 0;
  mockFetch(t, async () => ++requests === 1 ? { status: 404 } : {
    ok: true, json: async () => [],
    headers: linkHeaders('<'.repeat(16_384) + 'x>; rel="prev"'),
  });
  assert.equal(await githubRelease('v0.1.0'), null);
  assert.equal(requests, 2);
});
