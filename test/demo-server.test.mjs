import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mockProcessEnv } from './mock-process.mjs';

test('printed demo URL serves the page, relative modules and Wasm from the assembled layout', { timeout: 15000 }, async t => {
  const root = mkdtempSync(join(tmpdir(), 'grovedom-demo-server-'));
  mkdirSync(join(root, 'demo/control/src'), { recursive: true });
  mkdirSync(join(root, 'grovedom/src'), { recursive: true });
  for (const name of ['index.html', 'benchmark.js', 'comparison.js', 'workload.js', 'xml-workload.js'])
    copyFileSync(new URL(`../demo/${name}`, import.meta.url), join(root, 'demo', name));
  const browser = 'export const fixture = true;\n', wasm = Buffer.from([0, 97, 115, 109]);
  writeFileSync(join(root, 'grovedom/src/browser.js'), browser);
  writeFileSync(join(root, 'demo/control/src/browser.js'), browser);
  writeFileSync(join(root, 'grovedom/grovedom.wasm'), wasm);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/serve-demo.mjs', import.meta.url)), root, '0'], {
    env: mockProcessEnv(), stdio: ['ignore', 'pipe', 'pipe'],
  });
  const exit = once(child, 'exit');
  t.after(async () => {
    child.kill();
    await exit;
    rmSync(root, { recursive: true, force: true });
  });
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const printed = await new Promise((resolve, reject) => {
    let output = '';
    child.once('error', reject);
    child.once('exit', () => reject(new Error(`Demo server exited: ${stderr}`)));
    child.stdout.setEncoding('utf8').on('data', chunk => {
      output += chunk;
      const match = /Demo: (http:\/\/127\.0\.0\.1:\d+\/\S*)\r?\n/.exec(output);
      if (match) resolve(new URL(match[1]));
    });
  });
  assert(Number(printed.port) > 0, 'Print the actual listening port');
  const redirect = await fetch(new URL('/', printed), { redirect: 'manual' });
  assert.equal(redirect.status, 302);
  assert.equal(redirect.headers.get('location'), '/demo/');
  const page = await fetch(printed);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  const html = await page.text();
  assert.equal(html, readFileSync(join(root, 'demo/index.html'), 'utf8'));
  const entryURL = new URL(/<script[^>]*src="([^"]+)"/.exec(html)[1], page.url);
  const entry = await fetch(entryURL);
  assert.equal(entry.status, 200, 'The page must resolve its real module URL');
  assert.match(entry.headers.get('content-type'), /javascript/);
  const source = await entry.text();
  assert.equal(source, readFileSync(join(root, 'demo/benchmark.js'), 'utf8'));
  for (const [, specifier] of source.matchAll(/from '([^']+)'/g)) {
    const module = await fetch(new URL(specifier, entryURL));
    assert.equal(module.status, 200, specifier);
    assert.match(module.headers.get('content-type'), /javascript/);
    await module.arrayBuffer();
  }
  const binary = await fetch(new URL('../grovedom/grovedom.wasm', entryURL));
  assert.equal(binary.status, 200);
  assert.equal(binary.headers.get('content-type'), 'application/wasm');
  assert.deepEqual(Buffer.from(await binary.arrayBuffer()), wasm);
});
