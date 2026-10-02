// Check original TypeScript in memory. No consumer edits, emit, or installs.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const consumer = process.argv[2] && resolve(process.argv[2]);
if (!consumer) throw new Error('Usage: check-consumer-types.mjs CONSUMER [REVISION]');
const require = createRequire(resolve(consumer, 'package.json'));
const ts = require('typescript');
const engine = dirname(require.resolve('website-scrap-engine/package.json'));
const facade = fileURLToPath(new URL('../src/index.d.ts', import.meta.url));
const revision = execFileSync('git', ['rev-parse', '--verify', process.argv[3] ?? 'HEAD'], { cwd: consumer, encoding: 'utf8' }).trim();
const tracked = execFileSync('git', ['ls-tree', '-rz', '--name-only', revision, '--', 'src'], { cwd: consumer, encoding: 'utf8' })
  .split('\0').filter(Boolean);
const sourceNames = new Map(tracked.map(name => [resolve(consumer, name), name]));
const source = new Map();
const rootNames = tracked.filter(name => name.endsWith('.ts') && !name.startsWith('src/mdn/inject/')).map(name => resolve(consumer, name));
const options = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext, strict: true, noEmit: true,
  skipLibCheck: false, esModuleInterop: true, allowJs: true, types: [] };
function check(candidate) {
  const host = ts.createCompilerHost(options);
  const originalRead = host.readFile, originalExists = host.fileExists;
  host.fileExists = name => sourceNames.has(name) || originalExists(name);
  host.readFile = name => {
    if (!sourceNames.has(name)) return originalRead(name);
    if (!source.has(name)) source.set(name, execFileSync('git', ['show', `${revision}:${sourceNames.get(name)}`], { cwd: consumer, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
    return source.get(name);
  };
  host.resolveModuleNames = (names, containingFile) => names.map(name => {
    // Migrate the engine's public aliases together with its loads. Only these
    // two source trees change imports; GroveDOM still reuses real Cheerio types.
    if (name.startsWith('website-scrap-engine/lib/')) name = resolve(engine, 'src', name.slice('website-scrap-engine/lib/'.length));
    if (candidate && name === 'cheerio' && (containingFile.startsWith(consumer + '/src/') || containingFile.startsWith(engine + '/src/'))) name = facade;
    const result = ts.resolveModuleName(name, containingFile, options, host).resolvedModule;
    return result && { ...result, resolvedUsingTsExtension: false };
  });
  const program = ts.createProgram(rootNames, options, host);
  const diagnostics = ts.getPreEmitDiagnostics(program).map(item => ({
    file: item.file?.fileName.replace(consumer + '/', 'consumer/').replace(engine + '/', 'engine/'),
    line: item.file && item.start !== undefined ? item.file.getLineAndCharacterOfPosition(item.start).line + 1 : undefined,
    code: item.code, message: ts.flattenDiagnosticMessageText(item.messageText, '\n'),
  }));
  return { files: program.getSourceFiles().filter(f => !f.isDeclarationFile).length, diagnostics };
}
const reference = check(false), candidate = check(true);
console.log(JSON.stringify({ scope: 'tracked MDN TypeScript and transitively imported installed engine source; in-memory import/type-alias migration only',
  consumerRevision: revision,
  engineVersion: require('website-scrap-engine/package.json').version,
  compiler: ts.version, reference, candidate }, null, 2));
if (reference.diagnostics.length || candidate.diagnostics.length) process.exitCode = 1;
