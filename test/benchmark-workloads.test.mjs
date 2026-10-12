import test from 'node:test';
import assert from 'node:assert/strict';
import { load as cheerio } from 'cheerio';
import { load } from '../diagnostics/index.js';
import { kernel } from '../diagnostics/kernel.js';
import { cases, caseSource, caseReplay } from '../demo/workload.js';
import * as selectors from '../bench/selector-fixtures.mjs';

for (const execution of ['buffered', 'direct']) {
  const open = (source, options, isDocument) => load(source, { ...options, execution }, isDocument);
  for (const item of cases) test(`benchmark workload ${item.id}, ${execution}: output and owner isolation`, () => {
    const source = caseSource(item), expected = caseReplay(cheerio, source, item);
    const owner = open('<aside data-owner="kept">independent</aside>');
    try {
      const retained = owner('aside'), handle = retained[0], before = owner.html();
      const pinned = kernel.stats();
      // Repeated lifetimes exercise pooled reuse while another document stays live.
      for (let i = 0; i < 2; i++) {
        assert.equal(caseReplay(open, source, item), expected);
        assert.equal(kernel.stats().liveDocuments, pinned.liveDocuments);
        assert.equal(kernel.stats().liveBytes, pinned.liveBytes);
        assert.equal(retained[0], handle);
        assert.equal(retained.text(), 'independent');
        assert.equal(owner.html(), before);
      }
    } finally { owner.dispose(); }
    assert.equal(kernel.stats().liveDocuments, 0);
    assert.equal(kernel.stats().liveBytes, 0);
  });
  for (const dense of [false, true]) test(`selector benchmark ${dense ? 'dense' : 'sparse'}, ${execution}: exact counts and disposal`, () => {
    for (const rows of [0, 1, 600]) {
      assert.equal(selectors.replay(open, selectors.page(rows, dense)), String(dense ? 32 * rows : 0));
      assert.equal(kernel.stats().liveDocuments, 0);
      assert.equal(kernel.stats().liveBytes, 0);
    }
  });
}
