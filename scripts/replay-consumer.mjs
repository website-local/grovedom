import { readFileSync, writeFileSync } from 'node:fs';
import { fixtures, replay } from '../bench/consumer-replay.mjs';
import assert from 'node:assert/strict';
const corpus = [...fixtures];
if (process.env.GROVEDOM_CORPUS_MANIFEST) for (const item of JSON.parse(readFileSync(process.env.GROVEDOM_CORPUS_MANIFEST))) {
  corpus.push({ ...item, source: readFileSync(item.path, 'utf8') });
}
const results = [];
for (const item of corpus) {
  try { results.push({ id: item.id, result: JSON.parse(await replay(item.source, item)) }); }
  catch (error) { results.push({ id: item.id, error: error.stack }); process.exitCode = 1; }
}
const output = JSON.stringify(results, null, 2);
if (process.argv[2]) writeFileSync(process.argv[2], output);
else console.log(output);
if (process.argv[3]) {
  assert.deepEqual(results, JSON.parse(readFileSync(process.argv[3], 'utf8')));
  console.log(`${results.length} consumer cases match the reference output and resource events.`);
}
