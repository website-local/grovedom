// Isolated, offline replay build. Never modify the supplied consumer/dependencies.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { cpSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [consumer, output] = process.argv.slice(2).map(p => resolve(p));
if (!consumer || !output || existsSync(output)) throw new Error('Usage: prepare-consumer.mjs CONSUMER NEW_OUTPUT_DIRECTORY');
const require = createRequire(resolve(consumer, 'package.json'));
const ts = require('typescript');
const engine = dirname(require.resolve('website-scrap-engine/package.json'));
const files = execFileSync('git', ['ls-files', '-z', 'src'], { cwd: consumer, encoding: 'utf8' }).split('\0').filter(Boolean);
const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: consumer, encoding: 'utf8' }).trim();
if (execFileSync('git', ['diff', 'HEAD', '--', 'src'], { cwd: consumer }).length) throw new Error('Consumer tracked source must be clean');
mkdirSync(output, { recursive: true });
writeFileSync(resolve(output, 'package.json'), '{"type":"module"}\n');
symlinkSync(resolve(consumer, 'node_modules'), resolve(output, 'node_modules'), 'dir');
cpSync(resolve(engine, 'lib'), resolve(output, 'engine/lib'), { recursive: true });
const adapter = pathToFileURL(resolve(output, 'adapter.mjs')).href;
function imports(source) {
  return source.replace(/(from\s*|import\s*)(['"])(cheerio|website-scrap-engine\/[^'"]+)\2/g,
    (_, prefix, quote, name) => prefix + quote + (name === 'cheerio' ? adapter : pathToFileURL(resolve(output, 'engine', name.slice('website-scrap-engine/'.length))).href) + quote);
}
for (const name of files) {
  if (name.endsWith('.d.ts')) continue;
  const destination = resolve(output, name.replace(/^src\//, 'mdn/').replace(/\.ts$/, '.js'));
  mkdirSync(dirname(destination), { recursive: true });
  if (name.endsWith('.ts')) {
    const result = ts.transpileModule(readFileSync(resolve(consumer, name), 'utf8'), {
      fileName: name, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    });
    writeFileSync(destination, imports(result.outputText));
  } else cpSync(resolve(consumer, name), destination);
}
// Engine output is shipped with the installed, locked package.
const { readdirSync } = await import('node:fs');
for (const name of readdirSync(resolve(output, 'engine/lib'), { recursive: true })) {
  if (!name.endsWith('.js')) continue;
  const path = resolve(output, 'engine/lib', name);
  writeFileSync(path, imports(readFileSync(path, 'utf8')));
}
const scope = new URL('../integration/engine-adapter.mjs', import.meta.url).href;
writeFileSync(resolve(output, 'adapter.mjs'), `import { createEngineAdapter } from ${JSON.stringify(scope)};
import { pathToFileURL } from 'node:url';
const dom = await import(pathToFileURL(process.env.GROVEDOM_REPLAY_ENTRY).href);
const originalLoad = dom.load;
const adapter = createEngineAdapter(process.env.GROVEDOM_REPLAY_PARSER === 'htmlparser2'
  ? (input, options, document) => originalLoad(input, options?.xml || options?.xmlMode ? options : { ...options, xml: { xmlMode: false } }, document)
  : originalLoad);
export const { load, run } = adapter;
`);
writeFileSync(resolve(output, 'provenance.json'), JSON.stringify({
  mdnRevision: revision, mdnVersion: require('./package.json').version,
  engineVersion: JSON.parse(readFileSync(resolve(engine, 'package.json'))).version,
  cheerioVersion: require('cheerio/package.json').version,
  typescriptVersion: ts.version,
}, null, 2));
console.log('Prepared isolated consumer replay source.');
