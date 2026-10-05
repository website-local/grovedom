// Imported only by the release-script test subprocess. All requests stay local.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

globalThis.fetch = async (url, options = {}) => {
  const file = process.env.MOCK_STATE, state = JSON.parse(readFileSync(file));
  const { pathname, searchParams, hostname } = new URL(url);
  const path = pathname.replace('/repos/website-local/grovedom', '');
  const method = options.method ?? 'GET';
  state.requests.push([method, path]);
  const save = () => writeFileSync(file, JSON.stringify(state));
  const json = (data, status = 200, headers) => { save(); return Response.json(data, { status, headers }); };
  assert.equal(hostname, 'api.github.com', 'Unexpected network request');
  if (method === 'GET') {
    if (state.scenario === 'lookup-failure') return json({}, 503);
    if (path.startsWith('/releases/tags/'))
      return json(state.release, state.release && !state.release.draft && state.scenario !== 'published-list' ? 200 : 404);
    if (path === '/releases') {
      if (state.scenario === 'hidden-new') return json([]);
      if (state.scenario === 'paginated' && !searchParams.has('page'))
        return json([], 200, { link: '<https://api.github.com/repos/website-local/grovedom/releases?per_page=100&page=2>; rel="next"' });
      return json(state.release ? [state.release] : []);
    }
    if (path.startsWith('/git/ref/tags/')) return json({ object: state.tag }, state.tag ? 200 : 404);
    if (path.startsWith('/git/tags/')) return json({ object: state.annotation });
    if (path.startsWith('/releases/assets/')) {
      const name = decodeURIComponent(path.slice('/releases/assets/'.length));
      assert(name in state.payloads, 'Missing mock asset');
      save();
      return new Response(Buffer.from(state.payloads[name], 'base64'));
    }
  }
  throw new Error(`Unexpected mock request: ${method} ${url}`);
};
