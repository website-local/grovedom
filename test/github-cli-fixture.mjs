#!/usr/bin/env node
// Model the official CLI's create-with-assets and existing-release commands.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const file = process.env.MOCK_STATE, state = JSON.parse(readFileSync(file));
const args = process.argv.slice(2), command = args[1], tag = args[2];
const save = () => writeFileSync(file, JSON.stringify(state));
function upload(files) {
  for (const file of files) {
    const name = basename(file);
    assert(!state.release.assets.some(asset => asset.name === name), 'Must not overwrite assets');
    state.payloads[name] = readFileSync(file).toString('base64');
    state.release.assets.push({ name, url: `https://api.github.com/repos/website-local/grovedom/releases/assets/${name}` });
  }
}
assert.equal(args[0], 'release');
if (command === 'create') {
  assert.equal(state.release, null, 'Duplicate release');
  assert(!args.includes('--draft'), 'CLI must finish publication after uploading');
  const files = args.slice(3, args.indexOf('--target'));
  assert.equal(files.length, 4, 'Pass all assets in the create command');
  const target = args[args.indexOf('--target') + 1];
  assert.equal(target, state.commit);
  assert(readFileSync(args[args.indexOf('--notes-file') + 1], 'utf8').includes(state.commit));
  state.calls.push(['create', { target_commitish: target, prerelease: args.includes('--prerelease') }]);
  state.release = { id: 7, tag_name: tag, target_commitish: target, draft: true, assets: [] };
  if (state.scenario === 'upload-failure' && state.failOnce) {
    // gh attempts to clean up its newly created temporary draft on failure.
    state.failOnce = false;
    state.release = null;
    save();
    console.error('mock upload failure');
    process.exitCode = 1;
  } else {
    upload(files);
    state.release.draft = false;
    state.tag ??= { type: 'commit', sha: state.commit };
    save();
  }
} else if (command === 'upload') {
  state.calls.push(['upload', ...args.slice(3).map(file => basename(file))]);
  if (state.scenario === 'partial-failure' && state.failOnce) {
    state.failOnce = false;
    upload(args.slice(3, 4));
    save();
    console.error('mock upload failure');
    process.exitCode = 1;
  } else { upload(args.slice(3)); save(); }
} else if (command === 'edit') {
  assert.deepEqual(args.slice(3), ['--draft=false']);
  assert.equal(state.release.assets.length, 4, 'Incomplete release');
  state.calls.push(['publish']);
  state.release.draft = false;
  save();
} else throw new Error('Unexpected gh command');
