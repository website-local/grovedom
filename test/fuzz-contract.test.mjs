import test from 'node:test';
import assert from 'node:assert/strict';
import { generator, uint32, actions } from './fuzz/generate.mjs';
import { execute, checkLinks } from './fuzz/execute.mjs';
import { load } from '../diagnostics/index.js';
import { kernel } from '../diagnostics/kernel.js';
import { load as reference } from 'cheerio';

const item = {
  version: 2, seed: 0, index: 0, xml: false, malformed: false,
  source: '<main><p class="a" data-v="one">A</p><p class="b" data-v="two">B</p></main>',
  selectors: ['[data-v]', ':is(.a,.b)', 'main:has(.b)'],
  operations: [
    { selector: 'p', index: null, action: 'batch', value: 'É', markup: '' },
    { selector: 'p', index: null, action: 'attrCallback', value: '+', markup: '' },
    { selector: 'p', index: null, action: 'callbackThrow', value: '!', markup: '' },
    { selector: '.a', index: 0, action: 'remove', value: '', markup: '' },
    { selector: 'main', index: 0, action: 'append', value: '', markup: '<p class="a">new</p>' },
  ],
};

test('fuzz cases replay queued writes, callback partial effects and retained snapshots', () => {
  const expected = execute(reference, item);
  assert.deepEqual(expected.events.map(e => e.slice(0, 4)), [
    [1, 0, 'É', true], [1, 1, 'É', true], [2, 0, 'É+', true], [2, 1, 'É+', true], [2, 'caught'],
  ]);
  assert.equal(expected.observations[2].nodes[0].attrs['data-v'], 'É+!');
  assert.equal(expected.observations[2].nodes[1].attrs['data-v'], 'É+');
  assert.equal(expected.observations[4].retained[0][0], 1);
  assert.equal(expected.observations[4].retained[0][1], 'É');
  for (const execution of ['buffered', 'direct'])
    assert.deepEqual(execute(load, JSON.parse(JSON.stringify(item)), { execution, links: true }), expected);
  assert.equal(kernel.stats().liveDocuments, 0);
  assert.equal(kernel.stats().liveBytes, 0);
});

test('fuzz execution disposes the owner on unexpected operation failures', () => {
  let owner;
  assert.throws(() => execute((...args) => owner = load(...args), {
    ...item, operations: [...item.operations.slice(0, 1), { selector: 'p', index: 0, action: 'invalid' }],
  }), /Unknown fuzz operation/);
  assert.throws(() => owner.html(), { code: 'ERR_GROVEDOM_DISPOSED' });
  assert.equal(kernel.stats().liveDocuments, 0);
  assert.equal(kernel.stats().liveBytes, 0);
});

test('fuzz generation is reproducible and covers each profile and action', () => {
  const a = generator(0), b = generator(0), profiles = new Set(), covered = new Set();
  for (let i = 0; i < 32; i++) {
    const value = a(i); assert.deepEqual(value, b(i));
    profiles.add(value.profile); value.operations.forEach(op => covered.add(op.action));
  }
  assert.deepEqual([...profiles].sort(), ['foreign', 'html', 'select', 'template', 'xml']);
  assert.deepEqual([...covered].sort(), [...actions].sort());
  assert.notDeepEqual(generator(42)(0), generator(43)(0));
  for (const value of ['', ' ', 'NaN', -1, 1.5, 0x100000000, Infinity]) assert.throws(() => uint32(value), TypeError);
  assert.equal(uint32('0xffffffff'), 0xffffffff);
});

test('independent fuzz tree checks reject cycles and nonreciprocal links', () => {
  const root = { parent: null, children: [] }, child = { parent: root, prev: null, next: null, children: [] };
  root.children.push(child); root.childNodes = root.children; child.childNodes = child.children;
  checkLinks([root, child]);
  child.prev = child; assert.throws(() => checkLinks([root]), /Previous sibling link/); child.prev = null;
  root.parent = child; assert.throws(() => checkLinks([root]), /Cycle in parent links/);
});
