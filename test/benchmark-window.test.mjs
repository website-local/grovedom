import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { mockProcessEnv } from './mock-process.mjs';
import { readAffinity, checkHost } from '../bench/host-load.mjs';

test('host gate includes the exact threshold without admitting the next busy tick', { skip: process.platform !== 'linux' }, async t => {
  const cpus = readAffinity(), read = fs.readFileSync;
  let reads = 0, busyTicks = 0;
  t.mock.method(fs, 'readFileSync', (path, ...args) => {
    if (path === '/proc/stat') {
      const after = reads++ % 2;
      return cpus.map(cpu => `cpu${cpu} ${500 + after * busyTicks} 0 0 ${500 + after * (100 - busyTicks)} 0 0 0 0`).join('\n');
    }
    const sibling = String(path).match(/^\/sys\/devices\/system\/cpu\/cpu(\d+)\/topology\/thread_siblings_list$/);
    if (sibling) return sibling[1];
    return read(path, ...args);
  });
  t.mock.method(globalThis, 'setTimeout', callback => { queueMicrotask(callback); return 0; });
  for (const threshold of [0, 15, 30, 100]) {
    for (const ticks of [threshold - 1, threshold, threshold + 1].filter(n => n >= 0 && n <= 100)) {
      busyTicks = ticks;
      const result = await checkHost({ maxAttempts: 1, maxBusy: threshold / 100 });
      assert.equal(result.chosen.siblingMax, ticks / 100);
      assert.equal(result.quiet, ticks <= threshold, `${ticks} busy ticks at ${threshold}%`);
    }
  }
});

test('benchmark child warms through sample scheduling and keeps batches intact', t => {
  const root = mkdtempSync(join(tmpdir(), 'grovedom-window-child-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const events = join(root, 'events.jsonl');
  writeFileSync(join(root, 'entry.mjs'), 'export function load() {}');
  writeFileSync(join(root, 'workload.mjs'), `
import { appendFileSync } from 'node:fs';
let turn = 0;
function tick() { turn++; setImmediate(tick); }
setImmediate(tick);
export function page() { return 'input'; }
export async function replay() {
  appendFileSync(${JSON.stringify(events)}, JSON.stringify({turn})+'\\n');
  return 'ok';
}
`);
  const child = new URL('../bench/window-child.mjs', import.meta.url).href;
  writeFileSync(join(root, 'driver.mjs'), `
import { fork } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const child = fork(new URL(${JSON.stringify(child)}), [], {stdio:['ignore','ignore','inherit','ipc'],env:{...process.env,
  GROVEDOM_PROCESS_ENTRY:pathToFileURL(${JSON.stringify(join(root, 'entry.mjs'))}).href,
  GROVEDOM_PROCESS_FIXTURE:pathToFileURL(${JSON.stringify(join(root, 'workload.mjs'))}).href,
  GROVEDOM_PROCESS_CONFIG:JSON.stringify({consumer:true,corpus:[{id:'fixture'}],warmups:2,batches:2,iterations:2})}});
child.on('message', report => {
  if (report.kind === 'loaded') child.send('warmup');
  else if (report.kind === 'ready') child.send('sample');
  else { console.log(JSON.stringify(report)); child.send('stop'); }
});
child.on('exit', code => { process.exitCode = code ?? 1; });
`);
  const run = spawnSync(process.execPath, [join(root, 'driver.mjs')],
    { encoding: 'utf8', env: mockProcessEnv(), timeout: 10000 });
  assert.ifError(run.error);
  assert.equal(run.status, 0, run.stderr);
  const rows = readFileSync(events, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 7); // One verification, two warmups, two two-replay batches.
  assert(rows[1].turn > rows[0].turn);
  assert(rows[2].turn > rows[1].turn);
  assert(rows[3].turn > rows[2].turn);
  assert.equal(rows[3].turn, rows[4].turn);
  assert(rows[5].turn > rows[4].turn);
  assert.equal(rows[5].turn, rows[6].turn);
  const report = JSON.parse(run.stdout);
  assert.equal(report.consumed, 12);
  assert.equal(report.samples.length, 2);
  assert.equal(report.controls.length, 2);
});

// Exercise the real driver with deterministic host/child fixtures, not timings.
for (const scenario of ['initial', 'partial', 'error', 'run', 'pause', 'pause-initial', 'pause-exhausted', 'pause-groups']) {
  test(`benchmark window ${scenario}: bounded work and preserved results`, { skip: process.platform !== 'linux' }, t => {
    const root = mkdtempSync(join(tmpdir(), 'grovedom-window-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const out = join(root, 'result.json'), events = join(root, 'events.jsonl');
    const pausing = scenario.startsWith('pause');
    const hostPattern = {
      pause: [true, false, true, true],
      'pause-initial': [false, true, true, true],
      'pause-exhausted': [true, true, false, false, false],
      'pause-groups': [true, false, true, true, false, true, false],
    }[scenario];
    copyFileSync(new URL('../bench/window.mjs', import.meta.url), join(root, 'window.mjs'));
    const cpu = readAffinity()[0];
    writeFileSync(join(root, 'host-load.mjs'), `
import { appendFileSync, readFileSync } from 'node:fs';
let step = 0;
export async function checkHost(options) {
  const current = step++;
  const pattern = ${JSON.stringify(hostPattern) ?? 'null'};
  const quiet = pattern ? (pattern[current] ?? false) : !['initial','run'].includes(${JSON.stringify(scenario)}) && current < 2;
  appendFileSync(${JSON.stringify(events)}, JSON.stringify({host:current,quiet,...options})+'\\n');
  if (current === 2 && ['partial','error'].includes(${JSON.stringify(scenario)})) {
    const saved = JSON.parse(readFileSync(${JSON.stringify(out)}));
    if (saved.results[0].paired.length !== 1) throw Error('Missing earlier checkpoint');
    if (${JSON.stringify(scenario)} === 'error') throw Error('intentional host failure');
  }
  return {quiet,chosen:{cpu:${cpu},siblingMax:quiet?0:.5}};
}
`);
    writeFileSync(join(root, 'window-child.mjs'), `
import { appendFileSync } from 'node:fs';
const log = event => appendFileSync(${JSON.stringify(events)}, JSON.stringify({event,pid:process.pid})+'\\n');
log('ready');
process.send({kind:'ready',expected:['same output'],corpus:[{id:'fixture'}]});
process.on('message', message => {
  if (message === 'stop') { log('stop'); process.exit(0); }
  if (message === 'sample') { log('sample'); process.send({kind:'sample',samples:[1,1],controls:[[1,1],[1,1]]}); }
});
process.on('disconnect', () => process.exit(0));
`);
    writeFileSync(join(root, 'manifest.json'), JSON.stringify({ variants: [
      { name: 'baseline', entry: join(root, 'entry.mjs') },
      { name: 'control', entry: join(root, 'entry.mjs') },
    ] }));
    const run = spawnSync(process.execPath, [join(root, 'window.mjs'),
      `--manifest=${join(root, 'manifest.json')}`, `--out=${out}`, '--warmups=1',
      ...(pausing ? ['--max-busy-percent=30'] : []),
      ...(scenario === 'run' ? ['--busy=run'] : []),
      ...(pausing ? ['--busy=pause', '--max-pauses=2', `--groups=${scenario === 'pause-groups' ? 2 : 1}`] : []),
    ], { encoding: 'utf8', env: mockProcessEnv(), timeout: 10000 });
    assert.ifError(run.error);
    assert.equal(run.signal, null);
    const complete = ['run', 'pause', 'pause-initial'].includes(scenario);
    assert.equal(run.status, scenario === 'error' ? 1 : complete ? 0 : 2, run.stderr);
    const report = JSON.parse(readFileSync(out, 'utf8'));
    const rows = readFileSync(events, 'utf8').trim().split('\n').map(JSON.parse);
    assert(rows.filter(row => row.host !== undefined).every(row => row.maxAttempts === (scenario === 'run' ? 3 : 1)));
    assert.equal(report.settings.maxBusyPercent, pausing ? 30 : 15);
    assert(rows.filter(row => row.host !== undefined).every(row => row.maxBusy === (pausing ? .30 : .15)));
    const children = scenario === 'initial' ? 0 : scenario === 'pause-groups' ? 4 : 2;
    assert.equal(rows.filter(row => row.event === 'ready').length, children);
    assert.equal(rows.filter(row => row.event === 'stop').length, children);
    assert.equal(report.results[0].paired.length, scenario === 'initial' ? 0 : complete || scenario === 'pause-groups' ? 2 : 1);
    assert.equal(report.results[0].complete, complete || scenario === 'pause-groups');
    assert.equal(rows.filter(row => row.event === 'sample').length, report.results.reduce((n, group) => n + group.paired.length, 0) * 4);
    assert.equal(report.pauses.length, pausing ? (['pause', 'pause-initial'].includes(scenario) ? 1 : 2) : 0);
    if (pausing) {
      assert.equal(rows.filter(row => row.host !== undefined).length, hostPattern.length);
      let quiet = false;
      for (const row of rows) {
        if (row.host !== undefined) quiet = row.quiet;
        if (row.event === 'sample') assert(quiet, 'A busy check must never authorize a sample');
      }
    }
    if (scenario === 'pause-groups') {
      assert.equal(report.results.length, 2);
      assert.equal(report.results[1].paired.length, 0);
      assert.equal(report.results[1].complete, false);
      assert.equal(report.stopped.replication, 1);
    }
    assert.equal(existsSync(out + '.pending'), false);
    if (scenario === 'error') assert.match(run.stderr, /intentional host failure/);
    else {
      assert.deepEqual(JSON.parse(run.stdout), report);
      assert.equal(report.stopped?.stage ?? null, scenario === 'initial' ? 'initial' : ['partial', 'pause-exhausted', 'pause-groups'].includes(scenario) ? 'block' : null);
    }
  });
}

test('host activity threshold rejects invalid values before sampling', async () => {
  for (const maxBusy of [-.01, 1.01, NaN, Infinity])
    await assert.rejects(checkHost({ maxBusy }), /threshold/);
});

test('benchmark window rejects invalid activity percentages', t => {
  const root = mkdtempSync(join(tmpdir(), 'grovedom-window-options-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const manifest = join(root, 'manifest.json');
  writeFileSync(manifest, '{}');
  for (const value of ['-1', '101', 'NaN', 'Infinity', 'invalid']) {
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('../bench/window.mjs', import.meta.url)),
      '--manifest=' + manifest, '--max-busy-percent=' + value],
      { encoding: 'utf8', env: mockProcessEnv(), timeout: 10000 });
    assert.ifError(run.error);
    assert.equal(run.status, 1);
    assert.match(run.stderr, /Expected --max-busy-percent=0\.\.100/);
  }
});
