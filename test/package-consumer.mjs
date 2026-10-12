// Copied into an empty consumer: every import below resolves from installed tarballs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { checkPackage } from './package-contract.mjs';

const target = process.argv[2];
assert(['wasm', 'both'].includes(target));
const node = await import('grovedom');
const browser = await import('grovedom/browser');
assert.throws(() => browser.load('<p/>'), /Await/);
await browser.init({ wasm: readFileSync(new URL('./node_modules/grovedom/grovedom.wasm', import.meta.url)) });
const entries = [['grovedom', node], ['grovedom/browser', browser]];
if (target === 'both') entries.push(['grovedom-native', await import('grovedom-native')]);
for (const [name, api] of entries) {
  assert.deepEqual(Object.keys(api).sort(), ['contains', 'init', 'load', 'merge']);
  assert.equal(checkPackage(api), 14, name);
}
// Independently initialized entries must reject handles from other entries.
const owners = entries.map(([, api]) => api.load('<p>owned</p>'));
try {
  for (const a of owners) for (const b of owners) if (a !== b)
    assert.throws(() => a(b('p')[0]), TypeError);
  // First imports in caller-managed workers use the installed package loader.
  const names = target === 'both' ? ['grovedom', 'grovedom-native'] : ['grovedom'];
  await Promise.all(names.flatMap(name => [0, 1].map(() => new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./package-consumer-worker.mjs', import.meta.url), { workerData: name });
    let result;
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('Installed worker timed out')); }, 30000);
    worker.once('message', value => { result = value; });
    worker.once('error', error => { clearTimeout(timer); reject(error); });
    worker.once('exit', code => {
      clearTimeout(timer);
      if (code || result !== 14) reject(new Error(`Installed worker ${name}: exit=${code}, cases=${result}`));
      else resolve();
    });
  }))));
  for (const owner of owners) assert.equal(owner('p').text(), 'owned');
} finally { for (const owner of owners) owner.dispose(); }
console.log('Installed Node/browser/native API, callback, XML, lifetime and worker contracts passed.');
