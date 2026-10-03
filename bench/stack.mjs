// Linear-memory stack watermark diagnostic, never a release timing benchmark.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { page, replay } from '../test/fixtures.mjs';
import { page as sitemap, svg, replay as xmlReplay } from './xml-fixtures.mjs';
import { instrumentStack } from './wasm-stack-instrument.mjs';

if (!process.env.TMPDIR) throw new Error('Set a disk-backed TMPDIR.');
process.env.GROVEDOM_BACKEND = 'wasm';
process.env.GROVEDOM_WASM_HEAP = 'document';
const temporary = mkdtempSync(join(process.env.TMPDIR, 'grovedom-stack-'));
try {
  const build = process.env.GROVEDOM_WASM_BUILD_DIR;
  if (!build) throw new Error('Set GROVEDOM_WASM_BUILD_DIR to a stack diagnostic build.');
  const metadata = JSON.parse(readFileSync(join(build, 'build.json'), 'utf8'));
  assert.equal(metadata.profileStack, true, 'Build with GROVEDOM_WASM_PROFILE_STACK=1.');
  const { binary, sites } = instrumentStack(join(build, 'grovedom.wasm'), metadata.stackBytes);
  mkdirSync(join(temporary, 'build'));
  writeFileSync(join(temporary, 'build', 'grovedom.wasm'), binary);
  writeFileSync(join(temporary, 'build', 'build.json'), JSON.stringify(metadata));
  process.env.GROVEDOM_WASM_BUILD_DIR = join(temporary, 'build');
  const source = readFileSync(new URL('../src/wasm-kernel.js', import.meta.url), 'utf8');
  const point = 'const runtime = new WebAssembly.Instance(module, imports).exports;';
  assert.equal(source.split(point).length, 2);
  const instrumented = source.replace(point, `${point}
    if (!runtime.__stack_low || !runtime.__stack_high || !runtime.__stack_pointer) throw new Error('Build with GROVEDOM_WASM_PROFILE_STACK=1.');
    const low = runtime.__stack_low.value, high = runtime.__stack_high.value;
    if (runtime.__stack_pointer.value !== high) throw new Error('Unexpected initial stack pointer');
    new Uint8Array(runtime.memory.buffer, low, high - low).fill(stackPattern);
    stackRuntimes.push(runtime);`);
  writeFileSync(join(temporary, 'package.json'), readFileSync(new URL('../package.json', import.meta.url)));
  mkdirSync(join(temporary, 'src'));
  for (const file of ['index.js', 'kernel.js', 'selectors.js']) writeFileSync(join(temporary, 'src', file), readFileSync(new URL(`../src/${file}`, import.meta.url)));
  writeFileSync(join(temporary, 'src', 'wasm-kernel.js'), `let stackPattern = 0xa5;
  export const stackRuntimes = [];
  export function stackReset(pattern) { stackRuntimes.length = 0; stackPattern = pattern; }
  ${instrumented}`);

  const { load } = await import(pathToFileURL(join(temporary, 'src', 'index.js')).href);
  const { stackRuntimes, stackReset } = await import(pathToFileURL(join(temporary, 'src', 'wasm-kernel.js')).href);
  const cases = [120, 600, 5000].map(rows => ({ id: `authored-${rows}`, source: page(rows), run: replay }));
  for (const rows of [120, 600]) cases.push({ id: `sitemap-${rows}`, source: sitemap(rows), run: xmlReplay });
  for (const rows of [120, 300]) cases.push({ id: `svg-${rows}`, source: svg(rows), run: xmlReplay });
  for (const depth of [100, 1000, 10000]) cases.push({ id: `tree-depth-${depth}`,
    source: '<div>'.repeat(depth) + '<p>deep</p>' + '</div>'.repeat(depth),
    run(load, source) {
      const $ = load(source);
      try { $('p').text('changed'); $('div').first().find('p'); $.html(); $('body').empty(); $.flush(); }
      finally { $.dispose(); }
    },
  });
  for (const depth of [20, 100, 500]) cases.push({ id: `selector-depth-${depth}`, source: '<p>text</p>',
    run(load, source) { const $ = load(source); try { $(':is('.repeat(depth) + 'p' + ')'.repeat(depth)); } finally { $.dispose(); } },
  });
  for (const depth of [1, 20, 63, 64, 100]) cases.push({ id: `compatibility-selector-depth-${depth}`, source: '<template><p>text</p></template>',
    run(load, source) { const $ = load(source); try { $(':is('.repeat(depth) + ':contains(text)' + ')'.repeat(depth)); } finally { $.dispose(); } },
  });
  for (const depth of [1, 20, 63, 64]) cases.push({ id: `has-selector-depth-${depth}`,
    source: '<template></template><main>' + '<div>'.repeat(depth) + '<p>text</p>' + '</div>'.repeat(depth) + '</main>',
    run(load, source) { const $ = load(source); try { $('main').is(':has('.repeat(depth) + 'p' + ')'.repeat(depth)); } finally { $.dispose(); } },
  });
  for (const depth of [100, 1000, 5000]) cases.push({ id: `template-depth-${depth}`,
    source: '<template>'.repeat(depth) + '<p>deep</p>' + '</template>'.repeat(depth),
    run(load, source) {
      const $ = load(source, {}, false);
      try { $.root().children().clone().toString(); $('p').text('changed'); $.html(); $.root().empty(); $.flush(); }
      finally { $.dispose(); }
    },
  });
  for (const depth of [100, 1000, 5000]) cases.push({ id: `xml-depth-${depth}`,
    source: '<?xml version="1.0"?><Root>' + '<Node A="&#xe9;">'.repeat(depth) + '<![CDATA[deep]]>' + '</Node>'.repeat(depth) + '</Root>',
    run(load, source) {
      const $ = load(source, { xml: true });
      try { $('Root').clone().toString(); $(':root > Node').attr('A', 'changed'); $.xml(); $('Root').empty(); $.flush(); }
      finally { $.dispose(); }
    },
  });
  if (process.env.GROVEDOM_HTML_MANIFEST) {
    const manifest = JSON.parse(readFileSync(process.env.GROVEDOM_HTML_MANIFEST, 'utf8'));
    for (const { id, path } of manifest) cases.push({ id, source: readFileSync(path, 'utf8'), run: replay });
  }
  const results = [];
  for (const item of cases) for (const pattern of [0xa5, 0x5a]) {
    stackReset(pattern);
    let error;
    try { item.run(load, item.source); } catch (e) { error = e.code ?? e.name; }
    const memories = stackRuntimes.map(runtime => {
      const low = runtime.__stack_low.value, high = runtime.__stack_high.value;
      const bytes = new Uint8Array(runtime.memory.buffer, low, high - low);
      let first = 0; while (first < bytes.length && bytes[first] === pattern) first++;
      return { reservedBytes: high - low, writtenHighWaterBytes: bytes.length - first,
        pointerHighWaterBytes: high - runtime.__stack_minimum.value,
        pointerRestored: runtime.__stack_pointer.value === high };
    });
    results.push({ id: item.id, inputBytes: Buffer.byteLength(item.source), pattern, error, memories });
  }
  console.log(JSON.stringify({ scope: 'Wasm linear-memory stack pointer and written-byte high water; excludes the engine machine stack; observed workloads, not a worst-case bound', instrumentedStackWrites: sites, results }, null, 2));
} finally { rmSync(temporary, { recursive: true }); }
