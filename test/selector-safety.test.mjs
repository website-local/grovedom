import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { load } from '../diagnostics/index.js';
import { kernel } from '../diagnostics/kernel.js';

for (const mode of ['main', 'worker']) test(`excessive selector nesting is safe on the ${mode} thread`, { timeout: 20000 }, () => {
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('./selector-safety-fixture.mjs', import.meta.url)), mode], {
    encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
  });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.signal, null, child.stderr);
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /safe/);
});

test('the shared kernel bounds nesting independently of facade preprocessing', () => {
  const owner = kernel.create('<p class="target">text</p>', true, false);
  const roots = Uint32Array.of(1), selector = ':is('.repeat(513) + 'p' + ')'.repeat(513);
  try {
    for (const match of [false, true]) {
      assert.throws(() => kernel.query(owner, selector, roots, match), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
      const ids = kernel.query(owner, 'p.target:first-child', roots, false);
      assert.equal(ids.length, 1);
      assert.equal(kernel.read(owner, 2, ids, ''), 'text');
    }
  } finally { kernel.dispose(owner); }
  assert.equal(kernel.stats().liveDocuments, 0);
  assert.equal(kernel.stats().liveBytes, 0);
});

for (const execution of ['buffered', 'direct']) for (const xml of [false, true]) {
  test(`selector nesting rejection preserves observations and live owners (${execution}, xml=${xml})`, () => {
    const $ = load('<main><p class="target">text</p></main>', { execution, xml });
    const other = load('<p class="other">other</p>', { execution, xml });
    try {
      const retained = $('p'), node = retained[0];
      const nested = ':is('.repeat(513) + 'p' + ')'.repeat(513);
      for (const selector of [nested, nested + '[', ':not('.repeat(513) + 'p',
        ':is(]'.repeat(513) + 'p', '[title="\n' + nested]) {
        retained.attr('data-pending', 'kept');
        assert.throws(() => $(selector), { code: 'ERR_GROVEDOM_UNSUPPORTED' }, selector.slice(0, 40));
        // An uncached compound must succeed on its first attempt after rejection.
        assert.equal($('p[data-pending="kept"]').text(), 'text');
        assert.equal(retained[0], node);
        assert.equal(other('p.other:first-child').text(), 'other');
        for (let i = 0; i < 34; i++) $('p[data-cache="' + i + '"]');
      }
      assert.throws(() => retained.filter(nested), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
      assert.throws(() => retained.is(nested), { code: 'ERR_GROVEDOM_UNSUPPORTED' });
      assert.equal(retained.is('p.target'), true);
    } finally { $.dispose(); other.dispose(); }
    assert.equal(kernel.stats().liveDocuments, 0);
    assert.equal(kernel.stats().liveBytes, 0);
  });

  test(`selector nesting limit permits bounded functions and literal delimiters (${execution}, xml=${xml})`, () => {
    const $ = load('<main><p class="target">text</p></main>', { execution, xml });
    try {
      assert.equal($(':is('.repeat(512) + 'p' + ')'.repeat(512)).text(), 'text');
      assert.equal($('p' + ':is(p)'.repeat(1600)).text(), 'text');
      const text = '([{}])'.repeat(1600);
      $('p').attr('title', text);
      assert.equal($('p[title="' + text + '"]').text(), 'text');
      assert.equal($('p[title="' + text.replaceAll('(', '\\(').replaceAll(')', '\\)') + '"]').text(), 'text');
      assert.equal($('p/*' + text + '*/.target').text(), 'text');
      assert.equal($('p[title="' + '\\\r\n' + text + '"]').text(), 'text');
    } finally { $.dispose(); }
  });
}
