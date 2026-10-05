import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { load } from '../diagnostics/index.js';
import { selectorCases, selectorResult, escapeResult } from './web-platform/runner.mjs';
import { domCases } from './web-platform/dom-cases.mjs';

const read = name => readFileSync(new URL('./web-platform/' + name, import.meta.url), 'utf8');
const fixture = read('selectors.html');
const selectors = JSON.parse(read('selectors.json')), escapes = JSON.parse(read('escapes.json'));
for (const { row, context, name } of selectorCases(selectors)) test(name, { skip: row.skip }, () => {
  assert.deepEqual(selectorResult(load, fixture, row, context), { ids: row.expected, stable: true, unique: true });
});
for (const row of escapes) test(`WPT escape ${JSON.stringify(row.id)}: ${row.selector}`, { skip: row.skip }, t => {
  if (row.todo) {
    try { escapeResult(load, row); }
    catch (error) {
      if (error.code === 'ERR_GROVEDOM_SELECTOR') t.todo(row.todo);
      throw error;
    }
    assert.fail('Known selector limitation changed; review and remove the TODO.');
  }
  assert.deepEqual(escapeResult(load, row), { count: Number(row.matches), identity: true });
});
for (const execution of ['buffered', 'direct']) for (const row of domCases) test(`${execution}: ${row.name}`, () => {
  assert.deepEqual(row.run((source, options, document) => load(source, { ...options, execution }, document)), row.expected);
});
