import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../diagnostics/index.js';

test('wide shallow XML forms serialize without an argument-count limit', () => {
  // Disabled fields have a known empty result, independent of parser recovery.
  const $ = load('<form>' + '<input name="ignored" disabled="disabled"/>'.repeat(130000) + '</form>', { xml: true });
  try {
    const form = $('form');
    assert.deepEqual(form.serializeArray(), []);
    assert.equal(form.serialize(), '');
    form.empty().append('<input name="kept" value="snow 雪"/>');
    assert.equal(form.serialize(), 'kept=snow+%E9%9B%AA');
  } finally { $.dispose(); }
});
