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
  'attributes:(map, val) : should throw with wrong combination of arguments': 'Invalid-input error compatibility is not a performance gate.',
  "attributes:(bool) shouldn't treat boolean attributes differently in XML mode": 'XML is outside the HTML prototype.',
  'attributes:(invalid) : should be a no-op for invalid inputs': 'Invalid-input behavior is outside the compatibility target.',
  'attributes:(key, value) : should set data attribute': 'Includes an invalid numeric data key; normal data writes have separate coverage.',
  'traversing:(selector) : should throw an Error if given an invalid selector': 'Exact selector error messages are not a compatibility target.',
  'manipulation:() : should pass options': 'XML is outside the HTML prototype.',
  'manipulation:() : should preserve parsing options': 'XML is outside the HTML prototype.',
  'css:(any, val): should ignore unsupported prop types': 'Invalid property types are outside the compatibility target.',
};
const groups = {
  attributes: ['.attr', '.removeAttr', '.hasClass', '.addClass', '.removeClass', '.toggleClass', '.val', '.data'],
  traversing: ['.children', '.contents', '.next', '.nextAll', '.prev', '.prevAll', '.siblings', '.parent', '.closest', '.each', '.map', '.filter', '.not', '.has', '.first', '.last', '.eq', '.get', '.index', '.slice', '.end() :'],
  manipulation: ['.append', '.prepend', '.appendTo', '.prependTo', '.remove', '.empty', '.html', '.toString', '.text', '.clone', '.wrap', '.before', '.after', '.replaceWith'],
  forms: null, css: null, extract: null,
};
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
    .replaceAll("from '../__fixtures__/fixtures.js'", "from './fixtures.mjs'");
  if (file === 'fixtures.ts') result = result.replace('load([])', 'fixtureCheerio').replace("import { load }", "import { fixtureCheerio }");
  return '// Adapted from Cheerio 1.2.0; see README.md and cheerio-LICENSE.\n'+result;
}
for (const [file, selected] of Object.entries(groups)) writeFileSync(join(output, file+'.mjs'), convert(readFileSync(join(source, 'src/api', file+'.spec.ts'), 'utf8'), file+'.ts', selected));
writeFileSync(join(output, 'fixtures.mjs'), convert(readFileSync(join(source, 'src/__fixtures__/fixtures.ts'), 'utf8'), 'fixtures.ts'));
copyFileSync(join(source, 'LICENSE'), join(output, 'cheerio-LICENSE'));
copyFileSync(join(jquery, 'LICENSE.txt'), join(output, 'jquery-LICENSE'));
const jq = readFileSync(join(jquery, 'test/unit/attributes.js'), 'utf8');
const jqAst = ts.createSourceFile('jquery.js', jq, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const jqNames = ['attr(non-ASCII)', 'removeClass() removes duplicates', 'removeClass(undefined) is a no-op', 'contents().hasClass() returns correct values'];
const tests = jqAst.statements.filter(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(jqAst) === 'QUnit.test' && jqNames.includes(node.expression.arguments[0]?.text));
writeFileSync(join(output, 'jquery.mjs'), '// Adapted from jQuery 3.7.1; see README.md and jquery-LICENSE.\nimport { QUnit, fixtureCheerio as jQuery } from "../upstream-support.mjs";\n'+tests.map(node => node.expression.arguments[0]?.text === 'attr(non-ASCII)' ? node.getText(jqAst).replace('QUnit.test', 'QUnit.skip') : node.getText(jqAst)).join('\n\n')+'\n');
writeFileSync(join(output, 'selection.json'), JSON.stringify({ exclusions, cheerio: { version: '1.2.0', groups }, jquery: { version: '3.7.1', file: 'test/unit/attributes.js', tests: jqNames, exclusions: { 'attr(non-ASCII)': 'jQuery folds ASCII attribute lookup case; Cheerio and GroveDOM use exact lookup case.' } } }, null, 2)+'\n');
