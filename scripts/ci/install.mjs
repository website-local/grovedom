// Install real tarballs into an empty consumer without development dependencies.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [directory, target = 'wasm'] = process.argv.slice(2);
assert(directory && ['wasm', 'both'].includes(target) && process.env.TMPDIR && process.env.npm_execpath, 'Run npm run ci:install -- TARBALLS wasm|both with TMPDIR');
const root = resolve(directory), manifest = JSON.parse(readFileSync(join(root, 'release.json')));
const consumer = mkdtempSync(join(process.env.TMPDIR, 'grovedom-consumer-'));
writeFileSync(join(consumer, 'package.json'), '{"private":true,"type":"module"}\n');
const names = target === 'both' ? ['grovedom', 'grovedom-native'] : ['grovedom'];
const tarballs = names.map(name => join(root, manifest.packages.find(row => row.name === name).file));
execFileSync(process.execPath, [process.env.npm_execpath, 'install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs], { cwd: consumer, stdio: 'inherit' });
assert(!existsSync(join(consumer, 'node_modules/cheerio')));
const script = `
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from 'grovedom';
function check(api) {
  const $ = api('<p data-\\u00a0="old">é 😀</p>');
  try {
    $('p').attr('data-\\u00a0', 'new').append('<b>!</b>');
    assert.equal($('p').text(), 'é 😀!');
    assert.equal($('p').attr('data-\\u00a0'), 'new');
  } finally { $.dispose(); }
}
check(load);
const browser = await import('grovedom/browser');
await browser.init({ wasm: readFileSync(new URL('./node_modules/grovedom/grovedom.wasm', import.meta.url)) });
check(browser.load);
${target === 'both' ? "check((await import('grovedom-native')).load);" : ''}
console.log('Installed package Node/browser initialization and DOM checks passed.');
`;
writeFileSync(join(consumer, 'smoke.mjs'), script);
execFileSync(process.execPath, ['smoke.mjs'], { cwd: consumer, stdio: 'inherit' });
