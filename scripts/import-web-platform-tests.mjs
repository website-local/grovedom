// Offline, pinned import. Only data declarations and literal escape arguments
// are evaluated in isolated contexts; browser test scripts are not executed.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const source = process.argv[2];
if (!source) throw new Error('Pass an existing checkout of the pinned WPT source.');
const output = resolve(dirname(fileURLToPath(import.meta.url)), '../test/web-platform');
const revision = '564b9b1eb1387ef42456f1cba77d2d38599fad61';
const hashes = {
  'LICENSE.md': '5fac07febb0e2a97fb0d7b0def149ec08b642e1ba4b9c345283ab1cbd2af6570',
  'dom/nodes/selectors.js': 'cffc3f46deb933d63d4cb2cfd811d3ec21ec7804faab4826c8aba1868459e8d1',
  'dom/nodes/ParentNode-querySelector-All-content.html': '40eff9f6df0986178d2e138c256369fd22f09a8d15ba03fd1bef2ac2c104f9e2',
  'dom/nodes/ParentNode-querySelector-escapes.html': 'fa1e02eec0cc18cd335c07e25a8ee83dc14e091fcfd93e99bdfc8c774001d915',
};
const files = Object.fromEntries(Object.entries(hashes).map(([path, hash]) => {
  const bytes = readFileSync(join(source, path));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash, path);
  return [path, bytes.toString('utf8')];
}));
const data = {};
runInNewContext(files['dom/nodes/selectors.js'], data, { timeout: 1000 });
assert.equal(data.validSelectors.length, 207);

function exclusion(row) {
  if (!(row.testType & data.TEST_QSA)) return 'Upstream matches/find-only case; not a querySelectorAll case.';
  if (row.exclude?.includes('html')) return 'Upstream XHTML-only case; this fixture uses HTML.';
  if (/\|(?![=])/.test(row.selector)) return 'Requires namespace creation/matching outside the GroveDOM handle contract.';
  if (/:(?:target|link|visited|lang|any-link)\b/.test(row.selector)) return 'Browser URL/history or language selectors are outside this selected subset.';
  if (/::|:(?:first-line|first-letter|before|after)\b/.test(row.selector)) return 'Pseudo-elements and shadow DOM are outside the supported selector subset.';
  if (/unclosed|closing paren/.test(row.name)) return 'Browser CSS error recovery differs from the Cheerio selector contract.';
  if (row.selector === '#pseudo-link :enabled') return 'Cheerio 1.2.0 defines :enabled as :not(:disabled), including non-controls; covered by a separate compatibility regression.';
}
const selectors = Array.from(data.validSelectors, (row, index) => ({
  id: index, name: row.name, selector: row.selector, expected: Array.from(row.expect),
  contexts: ['document', 'element', 'detached', 'fragment'].filter(context => !row.exclude?.includes(context)),
  ...(exclusion(row) ? { skip: exclusion(row) } : {}),
  ...(row.selector === 'body #descendant-div1' ? { contextSkips: {
    element: 'Cheerio scoped find excludes ancestors outside its context; browser querySelectorAll permits them. Covered by scoped-selector regressions.',
  } } : {}),
}));
const escapes = [];
for (const match of files['dom/nodes/ParentNode-querySelector-escapes.html'].matchAll(/^test(Matched|NeverMatched)\((.+)\);$/gm)) {
  const [id, selector] = runInNewContext('[' + match[2] + ']', {}, { timeout: 1000 });
  assert.equal(typeof id, 'string'); assert.equal(typeof selector, 'string');
  escapes.push({ id, selector, matches: match[1] === 'Matched',
    ...(!id.isWellFormed() ? { skip: 'Lone UTF-16 surrogates cannot round-trip through the UTF-8 DOM representation.' } : {}),
    ...(['#\u00a0', '#\u2003'].includes(selector) ? { todo: 'Pinned Lexbor rejects these unescaped Unicode identifier characters; escaped forms pass. This standards gap remains best-effort.' } : {}),
  });
}
assert(escapes.length > 40);
mkdirSync(output, { recursive: true });
for (const [path, content] of Object.entries({
  'LICENSE.md': files['LICENSE.md'],
  'selectors.html': files['dom/nodes/ParentNode-querySelector-All-content.html'],
  'selectors.json': '[\n' + selectors.map(row => '  ' + JSON.stringify(row)).join(',\n') + '\n]\n',
  'escapes.json': '[\n' + escapes.map(row => '  ' + JSON.stringify(row)).join(',\n') + '\n]\n',
  'sources.json': JSON.stringify({ repository: 'https://github.com/web-platform-tests/wpt', revision, sha256: hashes,
    selection: 'All 207 validSelectors records retained with original expected IDs and explicit scope exclusions; four HTML contexts. All top-level testMatched/testNeverMatched escape calls retained.',
    selectors: selectors.length, escapes: escapes.length }, null, 2) + '\n',
})) writeFileSync(join(output, path), content);
console.log(`Imported ${selectors.length} selector records and ${escapes.length} CSS escape records with explicit exclusions.`);
