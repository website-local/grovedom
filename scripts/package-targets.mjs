import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const [key, ...rest] = value.split('=');
  return [key.replace(/^--/, ''), rest.join('=')];
}));
if (!args.out || !args.wasm || !args.native) throw new Error('Use --out=DIR --wasm=BUILD_DIR --native=BUILD_DIR');
const publishable = Object.hasOwn(args, 'publishable');
if (publishable) {
  const version = JSON.parse(readFileSync(join(root, 'package.json'))).version;
  assert.equal(JSON.parse(readFileSync(join(root, 'packages/native/package.json'))).version, version, 'Package versions must match');
  for (const target of ['native', 'wasm']) {
    const build = JSON.parse(readFileSync(join(args[target], 'build.json')));
    assert.equal(build.packageVersion, version, 'Build the committed package version');
    assert(!build.sanitize && !build.profile && !build.profileStack, 'Diagnostic artifacts cannot be published');
  }
  const module = new WebAssembly.Module(readFileSync(join(args.wasm, 'grovedom.wasm')));
  assert.equal(WebAssembly.Module.imports(module).length, 0, 'Release Wasm must be import-free');
  assert(!WebAssembly.Module.exports(module).some(({ name }) => /profile|__stack/.test(name)), 'Diagnostic Wasm exports');
  const native = readFileSync(join(args.native, 'grovedom.node'));
  assert.equal(native.subarray(0, 6).toString('hex'), '7f454c460201', 'Expected 64-bit little-endian ELF');
  assert.equal(native.readUInt16LE(18), 62, 'Native package currently supports x64 only');
}
const out = resolve(args.out);
if (existsSync(out)) throw new Error('Package output must be a new directory.');
for (const target of ['wasm', 'native']) {
  const destination = join(out, target === 'wasm' ? 'grovedom' : 'grovedom-native');
  mkdirSync(destination, { recursive: true });
  const manifest = JSON.parse(readFileSync(join(root, target === 'wasm' ? 'package.json' : 'packages/native/package.json')));
  delete manifest.scripts;
  delete manifest.devDependencies;
  if (publishable) delete manifest.private;
  writeFileSync(join(destination, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) cpSync(join(root, file), join(destination, file));
  cpSync(join(root, 'licenses'), join(destination, 'licenses'), { recursive: true });
  cpSync(join(root, 'src/facade'), join(destination, 'src/facade'), { recursive: true });
  for (const file of ['selectors.js', 'initialize.js', 'encoding.js', 'index.d.ts']) cpSync(join(root, 'src', file), join(destination, 'src', file));
  if (target === 'wasm') {
    cpSync(join(root, 'src/wasm'), join(destination, 'src/wasm'), { recursive: true });
    for (const file of ['index.js', 'browser.js', 'browser.d.ts']) cpSync(join(root, 'src', file), join(destination, 'src', file));
    cpSync(join(args.wasm, 'build-config.js'), join(destination, 'src/build-config.js'));
    cpSync(join(args.wasm, 'grovedom.wasm'), join(destination, 'grovedom.wasm'));
  } else {
    for (const file of ['native.js', 'native.d.ts']) cpSync(join(root, 'src', file), join(destination, 'src', file));
    cpSync(join(args.native, 'grovedom.node'), join(destination, 'grovedom.node'));
  }
  writeFileSync(join(destination, 'README.md'), '# ' + manifest.name + '\n\nExperimental ' + (target === 'wasm' ? 'Wasm-first HTML/XML DOM for Node, with a best-effort browser entry.' : 'Linux Node-API alternative to GroveDOM.') + '\n\nStandalone runtime and TypeScript declarations; Cheerio is not required.\n\nImport { init, load } from this package. Call init before DOM operations to set a custom ' + (target === 'wasm' ? 'wasm path, bytes or module; defaults use the bundled binary and an eight-instance bounded pool. In browsers, import grovedom/browser and await init().' : 'addon path; otherwise first use loads the bundled addon.') + '\n\nAlways call $.dispose() in finally after using a loaded document. Selections and handles belong to that document and package. The Cheerio-shaped API is partial; unsupported APIs are explicit errors. Node 22 (including 22.0.0) and Node 24 are tested; browser engines remain best-effort. No runtime environment variables or package metadata checks are used.\n\nGroveDOM is [MIT licensed](LICENSE). Bundled libraries retain their [third-party licenses and notices](THIRD_PARTY_NOTICES.md).\n');
}
cpSync(join(root, 'demo'), join(out, 'demo'), { recursive: true });
console.log('Prepared separate Wasm and native packages. Nothing published.');
