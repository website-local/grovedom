import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { prepareBenchmarkControl } from '../scripts/prepare-benchmark-control.mjs';

test('benchmark control isolates transitive modules while preserving source bytes', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'grovedom-benchmark-control-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const main = join(dir, 'main'), control = join(dir, 'control with spaces');
  const files = {
    'package.json': JSON.stringify({ private: true, type: 'module' }),
    'LICENSE': 'Fixture license\n',
    'src/browser.js': "import { create } from './nested/factory.js'; export const load = create();\n",
    'src/nested/factory.js': 'let instances = 0; export function create() { const id = ++instances; return () => id; }\n',
  };
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(join(main, file, '..'), { recursive: true });
    writeFileSync(join(main, file), text);
  }
  const original = await import(pathToFileURL(join(main, 'src/browser.js')).href);
  const queryOnly = await import(pathToFileURL(join(main, 'src/browser.js')).href + '?paired-control');
  assert.equal(original.load(), 1);
  assert.equal(queryOnly.load(), 2, 'An entry query still shares its relative helper imports');

  const entry = prepareBenchmarkControl(main, control);
  const isolated = await import(pathToFileURL(entry).href);
  assert.equal(isolated.load(), 1, 'The control must get an independent helper module');
  const originalFactory = await import(pathToFileURL(join(main, 'src/nested/factory.js')).href);
  const controlFactory = await import(pathToFileURL(join(control, 'src/nested/factory.js')).href);
  assert.notEqual(originalFactory.create, controlFactory.create);
  for (const file of ['src/browser.js', 'src/nested/factory.js', 'LICENSE'])
    assert.deepEqual(readFileSync(join(control, file)), readFileSync(join(main, file)));
  assert.deepEqual(JSON.parse(readFileSync(join(control, 'package.json'))), { private: true, type: 'module' });
  assert.equal(existsSync(join(control, 'grovedom.wasm')), false, 'The caller supplies the original binary');
  assert.throws(() => prepareBenchmarkControl(main, control), /new directory/);
  assert.equal(isolated.load(), 1);
  assert.equal(queryOnly.load(), 2);
});
