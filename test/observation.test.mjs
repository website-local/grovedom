import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from '../src/index.js';
import { load as cheerio } from 'cheerio';
import { kernel } from '../src/kernel.js';

test('empty snapshots stay independent across edits, documents, and disposal', () => {
  const $ = load('<main></main>'), other = load('<main></main>');
  try {
    const first = $('i'), second = $('i'), foreign = other('i');
    $('main').append('<i>added</i>');
    assert.equal(first.length, 0);
    first.splice(0, 0, $('i')[0]);
    assert.equal(first.text(), 'added');
    assert.equal(second.length, 0);
    assert.equal($('missing').length, 0);
    $.dispose();
    assert.throws(() => first.text(), { code: 'ERR_GROVEDOM_DISPOSED' });
    other('main').append('<i>independent</i>');
    assert.equal(foreign.length, 0);
    assert.equal(other('i').text(), 'independent');
  } finally { $.dispose(); other.dispose(); }
});

test('callback observations see pending writes across aliases and nested callbacks', () => {
  const transform = (loader, execution) => {
    const $ = loader('<main><p>A</p><p>B</p></main>', execution ? { execution } : undefined);
    const seen = [];
    try {
      const ps = $('p'), main = $('main'), second = ps.eq(1), secondNode = second[0];
      ps.attr('title', 'before');
      ps.each(function (i, node) {
        seen.push([i, node === ps[i], node.attribs.title, $(node).text()]);
        if (i === 0) {
          second.attr('title', 'nested').text('changed');
          second.each(function () { seen.push([this === secondNode, this.attribs.title, this.children[0].data]); });
          main.append('<p>new</p>');
          second.attr('title', 'later');
        } else $(node).attr('title', (_, previous) => previous + '!');
      });
      return [seen, ps.length, $.html()];
    } finally { $.dispose?.(); }
  };
  const expected = transform(cheerio);
  for (const execution of ['buffered', 'direct']) assert.deepEqual(transform(load, execution), expected);
  assert.equal(kernel.stats().liveBytes, 0);
});

test('combined write/read preserves partial effects and rejects unsafe buffers and owners', () => {
  const owner = kernel.create('<p>x</p>', true, false);
  const ids = kernel.query(owner, 'p', Uint32Array.of(1), false);
  const empty = new Uint8Array();
  try {
    // Set text followed by an invalid command. The following read must not run.
    assert.throws(() => kernel.observe(owner, 2, ids, '', Uint32Array.of(3, 1, 0, 1, 0, 0, ids[0], 99), Uint8Array.of(65)), { code: 'ERR_GROVEDOM_COMMAND' });
    assert.equal(kernel.read(owner, 2, ids, ''), 'A');
    assert.throws(() => kernel.observe(owner, 2, ids, '', new Uint32Array(new SharedArrayBuffer(32)), empty), { code: 'ERR_GROVEDOM_ARGUMENT' });
    assert.throws(() => kernel.observe({}, 2, ids, '', new Uint32Array(), empty), { code: 'ERR_GROVEDOM_HANDLE' });
    assert.throws(() => kernel.observe(owner, 2, Uint32Array.of(0xffffffff), '', new Uint32Array(), empty), { code: 'ERR_GROVEDOM_HANDLE' });
  } finally { kernel.dispose(owner); }
  assert.throws(() => kernel.observe(owner, 2, ids, '', new Uint32Array(), empty), { code: 'ERR_GROVEDOM_DISPOSED' });
  assert.equal(kernel.stats().liveBytes, 0);
});

test('mutation errors format operation indices without stdio and preserve prior effects', () => {
  const owner = kernel.create('<p>initial</p>', true, false);
  const ids = kernel.query(owner, 'p', Uint32Array.of(1), false);
  try {
    for (const index of [0, 9, 10, 99, 100]) {
      const words = new Uint32Array((index + 1) * 7);
      for (let i = 0; i < index; i++) words.set([3, 1, 0, 1, 0, 0, ids[0]], i * 7);
      words.set([1, 1, 0, 0, 0, 0, ids[0]], index * 7); // Empty attribute name fails in the mutation primitive.
      assert.throws(() => kernel.observe(owner, 2, ids, '', words, Uint8Array.of(65)), {
        code: 'ERR_GROVEDOM_MUTATION', message: `Mutation failed at operation ${index}; preceding effects remain`,
      });
      assert.equal(kernel.read(owner, 2, ids, ''), index ? 'A' : 'initial');
    }
  } finally { kernel.dispose(owner); }
  assert.equal(kernel.stats().liveBytes, 0);
});
