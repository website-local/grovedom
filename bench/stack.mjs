// Linear-memory stack watermark diagnostic, never a release timing benchmark.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createFacade } from '../src/facade/document.js';
import { createWasmKernel } from '../src/wasm/kernel.js';
import { nodePlatform, decodeInput } from '../src/wasm/node.js';
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
  let stackPattern = 0xa5;
  const stackRuntimes = [];
  function stackReset(pattern) { stackRuntimes.length = 0; stackPattern = pattern; }
  const platform = { ...nodePlatform, runtimeCreated(runtime) {
    if (!runtime.__stack_low || !runtime.__stack_high || !runtime.__stack_pointer) throw new Error('Build with GROVEDOM_WASM_PROFILE_STACK=1.');
    const low = runtime.__stack_low.value, high = runtime.__stack_high.value;
    assert.equal(runtime.__stack_pointer.value, high);
    new Uint8Array(runtime.memory.buffer, low, high - low).fill(stackPattern);
    stackRuntimes.push(runtime);
  } };
  const kernel = createWasmKernel(new WebAssembly.Module(binary), { heap: 'document' }, platform);
  const { load } = createFacade(kernel, decodeInput);
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
  for (const depth of [63, 64]) for (const relation of ['>', '~']) cases.push({
    id: `compatibility-${relation === '>' ? 'child' : 'sibling'}-${depth}`,
    source: '<template></template><main>' + (relation === '>'
      ? '<div>'.repeat(depth + 1) + 'text' + '</div>'.repeat(depth + 1)
      : '<div>text</div>'.repeat(depth + 1)) + '</main>',
    run(load, source) {
      const $ = load(source);
      try { $('div').last().is(('div ' + relation + ' ').repeat(depth) + 'div:contains(text)'); }
      finally { $.dispose(); }
    },
  });
  for (const depth of [63, 64]) cases.push({ id: `compatibility-nth-of-${depth}`, source: '<template></template><main><p>text</p></main>',
    run(load, source) {
      const $ = load(source);
      try { $('p').is(':nth-child(1 of '.repeat(depth) + ':contains(text)' + ')'.repeat(depth)); }
      finally { $.dispose(); }
    },
  });
  for (const depth of [100, 2000]) cases.push({ id: `selector-error-recovery-${depth}`, source: '<p>text</p>',
    run(load, source) {
      const $ = load(source);
      try {
        // Exercise tokenizer/error callbacks and nested AST cleanup, then reuse
        // the document. Error spelling is outside this stack diagnostic.
        for (const selector of [':is('.repeat(depth) + 'p' + ')'.repeat(depth) + '[',
          ':not('.repeat(depth) + 'p', ':nth-child(1e999999999999999999999999)']) {
          try { $(selector); } catch (error) {
            if (error.code !== 'ERR_GROVEDOM_SELECTOR') throw error;
          }
        }
        assert.equal($('p').text(), 'text');
      } finally { $.dispose(); }
    },
  });
  cases.push({ id: 'sort-5000', source: '<main>' + '<p>text</p>'.repeat(5000) + '</main>',
    run(load, source) {
      const $ = load(source);
      try { assert.equal($($('p').get().reverse()).add('p').length, 5000); }
      finally { $.dispose(); }
    },
  });
  cases.push({ id: 'unfinished-templates-5000', source: '<template>'.repeat(5000) + '<p>text',
    run(load, source) { const $ = load(source); try { $.html(); } finally { $.dispose(); } },
  });
  cases.push({ id: 'formatting-recovery-1000', source: '<p>' + '<b><i>text</b>'.repeat(1000),
    run(load, source) { const $ = load(source); try { $.html(); $('body').empty(); $.flush(); } finally { $.dispose(); } },
  });
  cases.push({ id: 'selectedcontent-clone', source: '<select><selectedcontent></selectedcontent><option><span>one</span></option><option>two</option></select>',
    run(load, source) {
      const $ = load(source);
      try { $('option').first().attr('selected', '').append('<b>extra</b>'); $('select').clone().toString(); $.html(); }
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
