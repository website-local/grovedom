import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'node:test';
import { load as groveLoad, contains, merge } from '../diagnostics/index.js';
export { describe, it, beforeEach };
const documents = [];
let fixture;
export function load(...args) { const $ = groveLoad(...args); documents.push($); return $; }
afterEach(() => { for (const $ of documents.splice(0)) $.dispose(); fixture = undefined; });
function fixtureAPI() { return fixture ??= load('<div id="qunit-fixture"></div>'); }
export const fixtureCheerio = Object.assign((input, context) => fixtureAPI()(input, context), {
  load,
  contains, merge,
  parseHTML: (...args) => fixtureAPI().parseHTML(...args),
  // Test-only adapters for jQuery's collection helpers; no runtime API added.
  each(object, callback) {
    for (const [key, value] of Object.entries(object))
      if (callback.call(value, Array.isArray(object) ? Number(key) : key, value) === false) break;
    return object;
  },
  map(object, callback) {
    return Object.entries(object).flatMap(([key, value]) => {
      const result = callback(value, Array.isArray(object) ? Number(key) : key);
      return result == null ? [] : result;
    });
  },
});
const example = groveLoad('');
export const Cheerio = example.root().constructor;
example.dispose();
export const isText = node => node?.type === 'text';
const identities = new WeakMap();
let nextIdentity = 0;
function comparable(value) {
  if (value?.constructor?.name === 'NodeHandle') {
    if (!identities.has(value)) identities.set(value, ++nextIdentity);
    return { nodeIdentity: identities.get(value) };
  }
  if (Array.isArray(value) || value instanceof Cheerio) return Array.from(value, comparable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, comparable(item)]));
  return value;
}
export function expect(value, negate = false) {
  const check = callback => {
    if (!negate) return callback();
    let failed = false;
    try { callback(); } catch (error) { if (error.code !== 'ERR_ASSERTION') throw error; failed = true; }
    assert.ok(failed, 'Negated assertion unexpectedly matched');
  };
  return {
    get not() { return expect(value, !negate); },
    toBe: expected => check(() => assert.equal(value, expected)),
    toEqual: expected => check(() => assert.deepEqual(comparable(value), comparable(expected))),
    toStrictEqual: expected => check(() => assert.deepEqual(comparable(value), comparable(expected))),
    toBeUndefined: () => check(() => assert.equal(value, undefined)),
    toBeNull: () => check(() => assert.equal(value, null)),
    toBeTruthy: () => check(() => assert.ok(value)),
    toBeFalsy: () => check(() => assert.ok(!value)),
    toHaveLength: length => check(() => assert.equal(value.length, length)),
    toHaveProperty: (key, expected) => check(() => { assert.ok(key in value); if (expected !== undefined) assert.deepEqual(value[key], expected); }),
    toBeInstanceOf: constructor => check(() => assert.ok(value instanceof constructor)),
    toContain: item => check(() => assert.ok(typeof value === 'string' ? value.includes(item) : Array.prototype.includes.call(value, item))),
    toMatch: pattern => check(() => assert.match(value, pattern)),
    toThrow: pattern => check(() => assert.throws(value, typeof pattern === 'string' ? error => error.message.includes(pattern) : pattern)),
  };
}
export const QUnit = { skip: it.skip, test(name, callback) { it(name, () => {
  let count = 0, expected;
  callback({ expect(n) { expected = n; }, ok(value, message) { count++; assert.ok(value, message); }, equal(a, b, message) { count++; assert.equal(a, b, message); }, strictEqual(a, b, message) { count++; assert.equal(a, b, message); } });
  if (expected !== undefined) assert.equal(count, expected);
}); } };
