// Reproduce the selected upstream cases with an already available TypeScript
// compiler. Generated tests need only Node's built-in test runner.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require(process.env.GROVEDOM_TYPESCRIPT_MODULE ?? 'typescript');
const source = process.env.GROVEDOM_CHEERIO_TEST_SOURCE;
const jquery = process.env.GROVEDOM_JQUERY_TEST_SOURCE;
if (!source || !jquery) throw new Error('Set both upstream source directories.');
const output = resolve('test/upstream');
mkdirSync(output, { recursive: true });
const exclusions = {
  'load:(html) : should handle xml tag option': 'Uses mismatched XML tags; exact malformed-input recovery is outside the supported contract. Well-formed XML script children have separate coverage.',
  'attributes:(key, value) : should update namespace': 'Arbitrary namespace changes and null domhandler attribute maps are outside the supported handle API.',
  'attributes:(inherited properties) : prop should support inherited properties': 'Child arrays are snapshots; writable live domhandler arrays are not supported.',
  'traversing:should throw a TypeError if given invalid input': 'Exact invalid-input error compatibility is not a performance gate.',
  'traversing:should throw an Error if given an invalid selector': 'Exact invalid-input error compatibility is not a performance gate.',
  'attributes:(map, val) : should throw with wrong combination of arguments': 'Invalid-input error compatibility is not a performance gate.',
  'attributes:(invalid) : should be a no-op for invalid inputs': 'Invalid-input behavior is outside the compatibility target.',
  'attributes:(key, value) : should set data attribute': 'Includes an invalid numeric data key; normal data writes have separate coverage.',
  'traversing:(selector) : should throw an Error if given an invalid selector': 'Exact selector error messages are not a compatibility target.',
  'css:(any, val): should ignore unsupported prop types': 'Invalid property types are outside the compatibility target.',
};
const groups = { attributes: null, traversing: null, manipulation: null, forms: null, css: null, extract: null, static: ['.contains', '.merge'], load: null };
function convert(text, file, selected) {
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const transform = context => {
    const visit = node => {
      if (ts.isExpressionStatement(node)) {
        const expression = node.expression;
        if (node.getText(ast).startsWith('expectTypeOf(')) return undefined;
        if (ts.isCallExpression(expression) && expression.expression.getText(ast) === 'it') {
          const reason = exclusions[file.replace('.ts', '') + ':' + expression.arguments[0]?.text];
          if (reason) return ts.factory.createExpressionStatement(ts.factory.createCallExpression(ts.factory.createPropertyAccessExpression(expression.expression, 'skip'), undefined, [expression.arguments[0], ...expression.arguments.slice(1)]));
        }
        if (selected && ts.isCallExpression(expression) && expression.expression.getText(ast) === 'describe') {
          const name = expression.arguments[0]?.text;
          if (name?.startsWith('.') && !selected.includes(name)) return undefined;
        }
      }
      return ts.visitEachChild(node, visit, context);
    };
    return node => ts.visitNode(node, visit);
  };
  const transformed = ts.transform(ast, [transform]);
  let result = ts.transpileModule(ts.createPrinter().printFile(transformed.transformed[0]), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  transformed.dispose();
  result = result.replaceAll("from 'vitest'", "from '../upstream-support.mjs'")
    .replace(/from '(?:\.\.\/(?:index|load-parse|load|cheerio)\.js|domhandler)'/g, "from '../upstream-support.mjs'")
    .replaceAll("from './index.js'", "from '../upstream-support.mjs'")
    .replaceAll("from '../__fixtures__/fixtures.js'", "from './fixtures.mjs'")
    .replaceAll("from './__fixtures__/fixtures.js'", "from './fixtures.mjs'");
  if (file === 'fixtures.ts') result = result.replace('load([])', 'fixtureCheerio').replace("import { load }", "import { fixtureCheerio }");
  return '// Adapted from Cheerio 1.2.0; see README.md and cheerio-LICENSE.\n'+result;
}
for (const [file, selected] of Object.entries(groups)) writeFileSync(join(output, file+'.mjs'), convert(readFileSync(join(source, ['static', 'load'].includes(file) ? 'src' : 'src/api', file+'.spec.ts'), 'utf8'), file+'.ts', selected));
writeFileSync(join(output, 'fixtures.mjs'), convert(readFileSync(join(source, 'src/__fixtures__/fixtures.ts'), 'utf8'), 'fixtures.ts'));
copyFileSync(join(source, 'LICENSE'), join(output, 'cheerio-LICENSE'));
copyFileSync(join(jquery, 'LICENSE.txt'), join(output, 'jquery-LICENSE'));
const jqGroups = {
  attributes: ['attr(non-ASCII)', 'removeClass() removes duplicates', 'removeClass(undefined) is a no-op',
    'contents().hasClass() returns correct values', 'removeAttr(Multi String, variable space width)',
    'addClass, removeClass, hasClass on elements with classes with non-HTML whitespace (gh-3072, gh-3003)',
    'hasClass correctly interprets non-space separators (trac-13835)',
    'coords returns correct values in IE6/IE7, see trac-10828',
    'should not throw at $(option).val() (trac-14686)'],
  manipulation: ['append to multiple elements (trac-8070)', 'html() on empty set',
    'manipulate mixed jQuery and text (trac-12384, trac-12346)',
    'Index for function argument should be received (trac-13094)'],
};
const jqTests = [];
const jqExclusions = {
  'attr(non-ASCII)': 'jQuery folds ASCII attribute lookup case; Cheerio and GroveDOM use exact lookup case.',
  'html() on empty set': 'jQuery returns undefined; Cheerio and GroveDOM return null, covered by a compatibility regression.',
};
for (const [file, names] of Object.entries(jqGroups)) {
  const text = readFileSync(join(jquery, `test/unit/${file}.js`), 'utf8');
  const ast = ts.createSourceFile('jquery.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const tests = ast.statements.filter(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(ast) === 'QUnit.test' && names.includes(node.expression.arguments[0]?.text));
  if (tests.length !== names.length) throw new Error(`Missing selected jQuery tests in ${file}`);
  jqTests.push(...tests.map(node => Object.hasOwn(jqExclusions, node.expression.arguments[0]?.text) ? node.getText(ast).replace('QUnit.test', 'QUnit.skip') : node.getText(ast)));
}
writeFileSync(join(output, 'jquery.mjs'), '// Adapted from jQuery 3.7.1; see README.md and jquery-LICENSE.\nimport { QUnit, fixtureCheerio as jQuery } from "../upstream-support.mjs";\n'+jqTests.join('\n\n')+'\n');
writeFileSync(join(output, 'selection.json'), JSON.stringify({ exclusions, cheerio: { version: '1.2.0', groups }, jquery: { version: '3.7.1', groups: jqGroups, exclusions: jqExclusions } }, null, 2)+'\n');
