import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';
import { kernel } from '../diagnostics/kernel.js';
import { load as cheerio } from 'cheerio';
import { balancedFixture } from '../bench/balanced-fixtures.mjs';
import { replayCorpus } from '../bench/corpus-workload.mjs';
import { checkLinks } from './fuzz/execute.mjs';

for (let ordinal = 0; ordinal < 48; ordinal++) {
  const item = balancedFixture(ordinal);
  if (item.malformed && item.mode !== 'html') {
    test(`${item.id}: malformed input preserves lifecycle safety`, () => {
      let $;
      try {
        try { $ = load(item.source, { xml: true }); }
        catch (error) { assert(error instanceof Error); }
        if ($) checkLinks([$.root()[0]]);
      } finally { $?.dispose(); }
      assert.equal(kernel.stats().liveDocuments, 0);
      assert.equal(kernel.stats().liveBytes, 0);
    });
  } else {
    test(`${item.id}: queries, snapshots, callbacks and edits match Cheerio`, () => {
      assert.deepEqual(replayCorpus(load, item), replayCorpus(cheerio, item));
      assert.equal(kernel.stats().liveDocuments, 0);
      assert.equal(kernel.stats().liveBytes, 0);
    });
  }
}
