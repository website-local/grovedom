import assert from 'node:assert/strict';

// Deliberately excludes build metadata and arbitrary dist-tags from this workflow.
export function releaseOptions(version, tag, packages, auth) {
  assert(typeof version === 'string' && !/\s/.test(version), 'Invalid release version');
  assert(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:alpha|beta|rc)\.(0|[1-9]\d*))?$/.test(version), 'Use a release version such as 0.1.0 or 0.1.1-alpha.1');
  assert(['latest', 'next'].includes(tag), 'Invalid npm tag');
  assert(['none', 'wasm', 'both'].includes(packages), 'Invalid package selection');
  assert(['oidc', 'token'].includes(auth), 'Invalid authentication method');
  const prerelease = version.includes('-');
  assert(!prerelease || tag === 'next', 'Prereleases must use the next npm tag');
  return { version, tag, packages, auth, prerelease, gitTag: `v${version}` };
}
