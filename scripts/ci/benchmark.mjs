// Setup counts toward the job budget. Never rebuild here or alter the workspace install.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readRelease } from './artifacts.mjs';
import { compare } from '../../demo/comparison.js';

const [tarballsArg, outputArg] = process.argv.slice(2);
assert(tarballsArg && outputArg, 'Use benchmark.mjs TARBALLS NEW_OUTPUT');
const start = Number(process.env.GROVEDOM_BENCH_JOB_START_MS);
assert(Number.isFinite(start) && start > 0, 'Job start timestamp required');
const deadline = start + 105000; // Reserve about 15 seconds for report upload and job teardown.
const out = resolve(outputArg), tarballs = resolve(tarballsArg);
mkdirSync(out, { recursive: false });
const pkg = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));
const manifest = readRelease(tarballs, pkg.version, process.env.GITHUB_SHA);
const current = manifest.packages.find(p => p.name === 'grovedom');
writeFileSync(join(out, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
const remaining = deadline - Date.now();
assert(remaining > 5000, 'Setup exhausted the benchmark job budget');
execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact',
  `current@file:${join(tarballs, current.file)}`, 'released@npm:grovedom@latest', `cheerio@${pkg.devDependencies.cheerio}`],
{ cwd: out, stdio: 'inherit', timeout: remaining - 3000 });
const metadata = {};
async function wasm(name, instance = '') {
  const root = join(out, 'node_modules', name);
  const info = JSON.parse(readFileSync(join(root, 'package.json')));
  const bytes = readFileSync(join(root, 'grovedom.wasm'));
  const api = await import(pathToFileURL(join(root, 'src/browser.js')).href + instance);
  await api.init({ wasm: bytes, heap: 'pool' });
  metadata[name] = { version: info.version, wasmSha256: createHash('sha256').update(bytes).digest('hex') };
  return api.load;
}
const currentLoad = await wasm('current'), releasedLoad = await wasm('released');
const controlLoad = await wasm('current', '?paired-control');
const cheerio = await import(pathToFileURL(join(out, 'node_modules/cheerio/dist/esm/index.js')));
const slim = await import(pathToFileURL(join(out, 'node_modules/cheerio/dist/esm/slim.js')));
metadata.cheerio = { version: JSON.parse(readFileSync(join(out, 'node_modules/cheerio/package.json'))).version };
const durationMs = deadline - Date.now();
assert(durationMs >= 1000, 'No measurement time remains in the job budget');
const result = await compare([
  { name: 'current Wasm', load: currentLoad }, { name: 'released Wasm', load: releasedLoad },
  { name: 'Cheerio default', load: cheerio.load }, { name: 'Cheerio htmlparser2', load: slim.load },
  { name: 'identical Wasm control', load: controlLoad, control: true },
], { durationMs });
const report = { schema: 1, commit: manifest.commit, metadata, runtime: process.version,
  heap: 'pool', jobBudgetMs: 120000, measurementBudgetMs: durationMs,
  elapsedSinceFirstStepMs: Date.now() - start, ...result };
writeFileSync(join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
let summary = `## Wasm benchmark\n\nCurrent ${metadata.current.version}; latest published ${metadata.released.version}; Cheerio ${metadata.cheerio.version}. Pooled heaps, shared browser workload.\n\n`;
summary += '| Case | Reference/current (paired) | Raw | Probe-filtered | Kept/complete blocks |\n| --- | --- | ---: | ---: | ---: |\n';
for (const row of result.results)
  summary += `| ${row.case} | ${row.reference} | ${row.raw.pairedSpeedup?.toFixed(3) ?? 'n/a'}× | ${row.filtered.pairedSpeedup?.toFixed(3) ?? 'n/a'}× | ${row.filtered.blocks}/${row.raw.blocks} |\n`;
summary += '\nBalanced ABBA/BAAB blocks; ratios above one favor current Wasm. Independent CPU-probe max/min ≤1.5 retains whole blocks. All raw/incomplete blocks are preserved. Identical-code controls should be near 1; ratios are never normalized by them. Setup and all cases share one ~2 minute job budget. Exact outputs are checked on every replay. Shared-host timings are diagnostic, not a regression/adoption gate.\n';
writeFileSync(join(out, 'summary.md'), summary);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
assert(result.sufficient, 'Fewer than three complete paired blocks per comparison fit in the job budget');
