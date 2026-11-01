// Copied into an empty consumer: every import below resolves from installed tarballs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Worker } from 'node:worker_threads';
import { checkPackage, packageCases } from './package-contract.mjs';

const target = process.argv[2];
assert(['wasm', 'both'].includes(target));
const expectedCases = packageCases.length * 2;
const node = await import('grovedom');
const browser = await import('grovedom/browser');
assert.throws(() => browser.load('<p/>'), /Await/);
assert.throws(() => browser.loadFast('<p/>'), /Await/);
await browser.init({ wasm: readFileSync(new URL('./node_modules/grovedom/grovedom.wasm', import.meta.url)) });
const entries = [['grovedom', node], ['grovedom/browser', browser]];
if (target === 'both') entries.push(['grovedom-native', await import('grovedom-native')]);
for (const [name, api] of entries) {
  assert.deepEqual(Object.keys(api).sort(), ['contains', 'init', 'load', 'loadFast', 'merge']);
  // The first Node/native DOM call also initializes through loadFast.
  const fast = api.loadFast('<p>first fast load</p>');
  try {
    assert.equal(fast('p').text(), 'first fast load');
    assert.equal('0' in fast('p'), false);
  } finally { fast.dispose(); }
  assert.equal(checkPackage(api), expectedCases, name);
}
// Independently initialized entries must reject handles from other entries.
const owners = entries.map(([, api]) => api.load('<p>owned</p>'));
try {
  for (const a of owners) for (const b of owners) if (a !== b)
    assert.throws(() => a(b('p')[0]), TypeError);
  // First imports in caller-managed workers use the installed package loader.
  const names = target === 'both' ? ['grovedom', 'grovedom-native'] : ['grovedom'];
  const workers = [];
  try {
    await Promise.all(names.flatMap(name => [0, 1].map(index => new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./package-consumer-worker.mjs', import.meta.url), { workerData: name });
      workers.push(worker);
      let result, phase = 'worker startup';
      const timer = setTimeout(() => {
        reject(new Error(`Installed worker ${name} #${index} timed out during ${phase}`));
      }, 30000);
      worker.once('online', () => { phase = 'worker module import'; });
      worker.on('message', value => {
        if (typeof value === 'number') { result = value; phase = `exit after ${value} cases`; }
        else phase = value.phase === 'case' ? `${value.execution}: ${value.name}` : value.phase;
      });
      worker.once('error', error => { clearTimeout(timer); reject(error); });
      worker.once('exit', code => {
        clearTimeout(timer);
        if (code || result !== expectedCases) reject(new Error(`Installed worker ${name} #${index}: exit=${code}, cases=${result}, phase=${phase}`));
        else resolve();
      });
    }))));
  } finally {
    // A worker stuck in native code must not delay reporting the original failure.
    void Promise.allSettled(workers.map(worker => worker.terminate()));
  }
  for (const owner of owners) assert.equal(owner('p').text(), 'owned');
} finally { for (const owner of owners) owner.dispose(); }
console.log('Installed Node/browser/native API, callback, XML, lifetime and worker contracts passed.');
