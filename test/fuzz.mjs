// Explicit, seeded differential/safety fuzzing; kept outside the unit-test glob.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { load as reference } from 'cheerio';
import { load } from '../diagnostics/index.js';
import { kernel } from '../diagnostics/kernel.js';
import { generator, uint32 } from './fuzz/generate.mjs';
import { execute } from './fuzz/execute.mjs';

const directory = process.env.GROVEDOM_FUZZ_DIR;
assert(process.env.TMPDIR && directory, 'Set disk-backed TMPDIR and GROVEDOM_FUZZ_DIR.');
const seed = uint32(process.env.GROVEDOM_FUZZ_SEED ?? 0x67a31b29);
const count = Number(process.env.GROVEDOM_FUZZ_CASES ?? 1000);
assert(Number.isSafeInteger(count) && count > 0, 'Expected a positive case count');
const malformed = process.env.GROVEDOM_FUZZ_MALFORMED;
assert(malformed === undefined || ['0', '1'].includes(malformed), 'Expected GROVEDOM_FUZZ_MALFORMED=0|1');
const generate = generator(seed, { templates: process.env.GROVEDOM_FUZZ_TEMPLATES === '1',
  malformed: malformed === undefined ? null : malformed === '1' });
const supplied = process.env.GROVEDOM_FUZZ_CASE_FILE ? JSON.parse(readFileSync(process.env.GROVEDOM_FUZZ_CASE_FILE, 'utf8')) : null;
if (supplied) assert(supplied.version === undefined || supplied.version === 2, 'Unsupported fuzz case version');
mkdirSync(directory, { recursive: true });
let completed = 0, rejectedMalformed = 0, executions = 0, safetyCases = 0;
const coverage = { profiles: {}, actions: {}, matchedActions: {} };
for (let i = 0; i < (supplied ? 1 : count); i++) {
  const item = supplied ?? generate(i);
  let stage = {};
  // Keep input plus the last entered stage even if a sanitizer aborts the process.
  writeFileSync(join(directory, 'active.json'), JSON.stringify(item));
  const progress = update => { stage = { ...stage, ...update }; writeFileSync(join(directory, 'stage.json'), JSON.stringify(stage)); };
  try {
    progress({ backend: 'cheerio', execution: 'reference' });
    const expected = item.malformed ? null : execute(reference, item, { progress });
    for (const execution of ['buffered', 'direct']) {
      progress({ backend: process.env.GROVEDOM_BACKEND ?? 'wasm', execution });
      try {
        const actual = execute(load, item, { execution, links: true, progress });
        if (!item.malformed && !isDeepStrictEqual(actual, expected)) {
          const step = actual.observations.findIndex((value, i) => !isDeepStrictEqual(value, expected.observations[i]));
          progress({ phase: 'compare', step });
          const prefix = join(directory, `difference-${item.seed ?? seed}-${item.index}`);
          writeFileSync(prefix + '-actual.json', JSON.stringify(actual));
          writeFileSync(prefix + '-expected.json', JSON.stringify(expected));
          throw new Error(`Differential mismatch at operation ${step}; full observations: ${prefix}-{actual,expected}.json`);
        }
      } catch (error) {
        if (!item.malformed || !['ERR_GROVEDOM_PARSE', 'ERR_GROVEDOM_XML', 'ERR_GROVEDOM_SELECTOR', 'ERR_GROVEDOM_UNSUPPORTED'].includes(error.code)) throw error;
        rejectedMalformed++;
      }
      assert.equal(kernel.stats().liveDocuments, 0, 'Fuzz case left a live document');
      assert.equal(kernel.stats().liveBytes, 0, 'Fuzz case left live kernel backing allocations');
      if (item.malformed) {
        const probe = load('<p>usable</p>');
        try { assert.equal(probe('p').attr('data-probe', 'ok').text(), 'usable'); }
        finally { probe.dispose(); }
        assert.equal(kernel.stats().liveDocuments, 0);
        assert.equal(kernel.stats().liveBytes, 0);
      }
      executions++;
    }
    coverage.profiles[item.profile ?? (item.xml ? 'xml' : 'html')] = (coverage.profiles[item.profile ?? (item.xml ? 'xml' : 'html')] ?? 0) + 1;
    for (const { action } of item.operations) coverage.actions[action] = (coverage.actions[action] ?? 0) + 1;
    if (item.malformed) safetyCases++;
    else for (const [step, op] of item.operations.entries()) if (expected.observations[step].selectedLength)
      coverage.matchedActions[op.action] = (coverage.matchedActions[op.action] ?? 0) + 1;
    completed++;
  } catch (error) {
    const file = join(directory, `failure-${item.seed ?? seed}-${item.index}.json`);
    writeFileSync(file, JSON.stringify({ ...item, stage, error: { name: error.name, code: error.code, message: error.message } }, null, 2));
    throw new Error(`Fuzz failure at seed ${item.seed ?? seed}, case ${item.index}; reproducer: ${file}`, { cause: error });
  }
}
console.log(JSON.stringify({ scope: 'Seeded DOM differential, callback, batching, retained-tree and malformed-input safety checks; no performance claim.',
  seed: supplied?.seed ?? seed, completed, executions, safetyCases, rejectedMalformed, coverage,
  backend: process.env.GROVEDOM_BACKEND ?? 'wasm', heap: process.env.GROVEDOM_WASM_HEAP, kernel: kernel.stats() }));
