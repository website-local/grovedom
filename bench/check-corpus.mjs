// Offline differential corpus runner. Downloads are deliberately separate.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { load as cheerio } from 'cheerio';
import { replayCorpus } from './corpus-workload.mjs';

const options = Object.fromEntries(process.argv.slice(2).map(arg => {
  const match = /^--([^=]+)=(.*)$/.exec(arg);
  if (!match) throw new Error('Expected --name=value arguments');
  return [match[1], match[2]];
}));
if (!options.manifest || !options.out) throw new Error('Expected --manifest=FILE --out=FILE');
const filename = path.resolve(options.manifest), base = path.dirname(filename);
const manifest = JSON.parse(readFileSync(filename));
const hash = data => createHash('sha256').update(data).digest('hex');
const digest = value => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return { bytes: Buffer.byteLength(text), sha256: hash(text) };
};
const phases = value => Object.fromEntries(Object.entries(value).map(([name, result]) => [name, digest(result)]));
let api, kernel;
if (options.entry) {
  api = await import(pathToFileURL(path.resolve(options.entry)));
  if (options.artifact) {
    const artifact = path.resolve(options.artifact);
    await api.init(options.native === '1' ? { addon: artifact } : {
      wasm: options.browser === '1' ? readFileSync(artifact) : artifact, heap: options.heap ?? 'pool' });
  }
} else {
  api = await import('../diagnostics/index.js');
  ({ kernel } = await import('../diagnostics/kernel.js'));
}
const report = { version: 1, variant: options.name ?? 'current', manifestSha256: hash(readFileSync(filename)),
  workloadSha256: hash(readFileSync(new URL('./corpus-workload.mjs', import.meta.url))),
  checkerSha256: hash(readFileSync(new URL(import.meta.url))),
  runtime: process.version, scope: 'Offline correctness and lifecycle observations; no timing or adoption claim.', rows: [] };
writeFileSync(options.out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
function run(load, item) {
  const partial = {};
  let stage = 'parse';
  try {
    replayCorpus(load, item, { execution: options.execution ?? 'buffered', progress(name, value) {
      stage = name;
      if (value !== undefined) partial[name] = value;
    } });
    return { values: partial, stage, error: null };
  } catch (error) {
    return { values: partial, stage, error: { name: error.name, message: error.message } };
  }
}
for (const descriptor of manifest.entries) {
  if (options.ids && !options.ids.split(',').includes(descriptor.id)) continue;
  const source = readFileSync(path.resolve(base, descriptor.file), 'utf8');
  assert.equal(hash(source), descriptor.sha256, descriptor.id + ' input hash');
  const item = { ...descriptor, source };
  appendFileSync(options.out + '.progress.jsonl', JSON.stringify({ id: item.id, phase: 'start' }) + '\n');
  const reference = run(cheerio, item), actual = run(api.load, item);
  const expectedPhases = phases(reference.values), actualPhases = phases(actual.values);
  const mismatches = [];
  for (const name of new Set([...Object.keys(expectedPhases), ...Object.keys(actualPhases)])) {
    if (JSON.stringify(expectedPhases[name]) === JSON.stringify(actualPhases[name])) continue;
    const string = value => typeof value === 'string' ? value : JSON.stringify(value);
    const expected = string(reference.values[name]) ?? '', observed = string(actual.values[name]) ?? '';
    let offset = 0;
    while (offset < Math.min(expected.length, observed.length) && expected[offset] === observed[offset]) offset++;
    mismatches.push({ phase: name, expected: expectedPhases[name] ?? null, actual: actualPhases[name] ?? null,
      offset, expectedContext: expected.slice(Math.max(0, offset - 100), offset + 200),
      actualContext: observed.slice(Math.max(0, offset - 100), offset + 200) });
  }
  const stats = kernel?.stats();
  if (stats) {
    assert.equal(stats.liveDocuments, 0, item.id + ' leaked document');
    assert.equal(stats.liveBytes, 0, item.id + ' live bytes');
    // Native handle-control records can outlive explicit document disposal
    // until their JS handles are collected. Track them here; check after GC.
  }
  const row = { id: item.id, group: item.group, mode: item.mode, family: item.family ?? item.category,
    malformed: item.malformed, inputSha256: item.sha256,
    status: reference.error || actual.error ? 'exception' : mismatches.length ? 'mismatch' : 'match',
    referenceError: reference.error, actualError: actual.error,
    referenceStage: reference.stage, actualStage: actual.stage,
    expectedPhases, actualPhases, mismatches, stats };
  report.rows.push(row);
  appendFileSync(options.out + '.rows.jsonl', JSON.stringify(row) + '\n');
  appendFileSync(options.out + '.progress.jsonl', JSON.stringify({ id: item.id, phase: 'complete', status: row.status }) + '\n');
  console.log(JSON.stringify({ id: item.id, status: row.status, phases: mismatches.map(m => m.phase),
    referenceError: reference.error, actualError: actual.error }));
}
kernel?.trim?.();
if (global.gc) for (let i = 0; i < 3; i++) {
  global.gc();
  await new Promise(resolve => setImmediate(resolve));
}
report.finalStats = kernel?.stats();
report.finalCollectionChecked = Boolean(global.gc);
if (global.gc && report.finalStats?.controlBytes !== undefined)
  assert.equal(report.finalStats.controlBytes, 0, 'Control records remain after collection');
report.summary = report.rows.reduce((counts, row) => (counts[row.status] = (counts[row.status] ?? 0) + 1, counts), {});
writeFileSync(options.out, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ variant: report.variant, cases: report.rows.length, ...report.summary }));
if (report.rows.some(row => row.status !== 'match')) process.exitCode = 2;
