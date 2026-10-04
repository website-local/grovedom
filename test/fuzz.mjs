// Explicit, seeded differential/safety fuzzing; kept outside the unit-test glob.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { load as reference } from 'cheerio';
import { load } from '../diagnostics/index.js';
import { kernel } from '../diagnostics/kernel.js';

const directory = process.env.GROVEDOM_FUZZ_DIR;
assert(process.env.TMPDIR && directory, 'Set disk-backed TMPDIR and GROVEDOM_FUZZ_DIR.');
mkdirSync(directory, { recursive: true });
const seed = Number(process.env.GROVEDOM_FUZZ_SEED ?? 0x67a31b29) >>> 0;
let random = seed || 1;
function next(max) { random ^= random << 13; random ^= random >>> 17; random ^= random << 5; return (random >>> 0) % max; }
const pick = values => values[next(values.length)];
const words = ['plain', 'é漢字', 'a & b', '<quote>"', '\u00a0', '', 'one\ntwo'];
const escape = s => s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const count = Number(process.env.GROVEDOM_FUZZ_CASES ?? 1000);
assert(Number.isSafeInteger(count) && count > 0);
function generate(index) {
  const xml = Boolean(index % 2), tags = xml ? ['Item', 'Node', 'Path', 'svg', 'g'] : ['div', 'section', 'span', 'ul', 'li'];
  let id = 0;
  function tree(depth) {
    const tag = pick(tags), n = id++;
    const content = depth && next(3) ? Array.from({ length: 1 + next(3) }, () => tree(depth - 1)).join('') : escape(pick(words));
    return `<${tag} id="n${n}" class="${pick(['a', 'b', 'a b', 'omit', ''])}" data-v="${escape(pick(words))}">${content}</${tag}>`;
  }
  let source = xml ? `<Root>${tree(3)}${tree(2)}</Root>` : `<main>${tree(3)}${tree(2)}</main>`;
  const templates = !xml && process.env.GROVEDOM_FUZZ_TEMPLATES === '1';
  if (templates) source = source.replace('</main>', '<template><section class="a"><span class="b" data-v="template">content</span></section></template></main>');
  // This mode stresses queries crossing template fragments. Direct mutation of
  // template containers has separately documented upstream serialization gaps.
  const selectors = [templates ? '*:not(template)' : '*', '.a', '.b', templates ? ':not(.omit):not(template)' : ':not(.omit)', '[data-v]', ...tags, tags[0] + ' > ' + tags[1], tags[0] + ', ' + tags[2], templates ? ':nth-child(2n):not(template)' : ':nth-child(2n)', '#n' + next(id)];
  if (templates) selectors.push('.a > .b', '.a, .b', 'main .a', 'main > :is(.a,.b)');
  const operations = [];
  for (let i = 0; i < 16; i++) {
    const tag = pick(tags), value = pick(words);
    operations.push({ selector: pick(selectors), action: pick(['observe', 'attr', 'text', 'append', 'prepend', 'remove', 'empty', 'before', 'after', 'class', 'clone']),
      index: next(5) - 2, value, markup: `<${tag} data-v="${escape(value)}">${escape(value)}</${tag}>` });
  }
  const malformed = process.env.GROVEDOM_FUZZ_MALFORMED === '1';
  if (malformed) for (let i = 0; i < 8; i++) {
    const at = next(source.length + 1);
    source = source.slice(0, at) + pick(['<', '&', '"', '\u0000', '<!--', '<![CDATA[', '</', '']) + source.slice(at + next(4));
  }
  return { seed, index, xml, templates, malformed, source, operations };
}
function execute(factory, item) {
  let $;
  try {
    $ = factory(item.source, item.xml ? { xml: true } : {});
    const observations = [];
    for (const op of item.operations) {
      const found = $(op.selector), selected = found.eq(op.index);
      switch (op.action) {
        case 'attr': selected.attr('data-v', op.value); break;
        case 'text': selected.text(op.value); break;
        case 'append': selected.append(op.markup); break;
        case 'prepend': selected.prepend(op.markup); break;
        case 'before': selected.before(op.markup); break;
        case 'after': selected.after(op.markup); break;
        case 'remove': selected.remove(); break;
        case 'empty': selected.empty(); break;
        case 'class': selected.toggleClass('a b'); break;
        case 'clone': selected.append(selected.children().first().clone()); break;
        case 'observe': break;
        default: throw new Error('Unknown fuzz operation');
      }
      // Retained selection membership and removed-node observations matter too.
      observations.push({ length: found.length, selected: selected.toString(), text: selected.text(),
        nodes: selected.get().map(node => ({ name: node.name, attrs: { ...node.attribs } })),
        output: item.xml ? $.xml() : $.html() });
    }
    return observations;
  } finally { $?.dispose?.(); }
}
const supplied = process.env.GROVEDOM_FUZZ_CASE_FILE ? JSON.parse(readFileSync(process.env.GROVEDOM_FUZZ_CASE_FILE, 'utf8')) : null;
let completed = 0, rejectedMalformed = 0;
for (let i = 0; i < (supplied ? 1 : count); i++) {
  const item = supplied ?? generate(i);
  // Preserve the active input even if a sanitizer or runtime aborts the process.
  writeFileSync(join(directory, 'active.json'), JSON.stringify(item));
  try {
    if (item.malformed) {
      try { execute(load, item); } catch (error) {
        if (!['ERR_GROVEDOM_PARSE', 'ERR_GROVEDOM_XML', 'ERR_GROVEDOM_SELECTOR', 'ERR_GROVEDOM_UNSUPPORTED'].includes(error.code)) throw error;
        rejectedMalformed++;
      }
    } else assert.deepEqual(execute(load, item), execute(reference, item));
    assert.equal(kernel.stats().liveDocuments, 0, 'Fuzz case left a live document');
    assert.equal(kernel.stats().liveBytes, 0, 'Fuzz case left live kernel backing allocations');
    completed++;
  } catch (error) {
    const file = join(directory, `failure-${seed}-${item.index}.json`);
    writeFileSync(file, JSON.stringify({ ...item, error: { name: error.name, code: error.code, message: error.message } }, null, 2));
    throw new Error(`Fuzz failure at seed ${seed}, case ${item.index}; reproducer: ${file}`, { cause: error });
  }
}
console.log(JSON.stringify({ scope: 'Seeded DOM transformation differential and malformed-input safety checks; no performance claim.',
  seed, completed, rejectedMalformed, backend: process.env.GROVEDOM_BACKEND ?? 'wasm', heap: process.env.GROVEDOM_WASM_HEAP, kernel: kernel.stats() }));
