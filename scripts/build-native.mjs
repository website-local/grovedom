import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareDependency } from './prepare-dependency.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let source = process.env.GROVEDOM_LEXBOR_SOURCE;
const build = resolve(process.env.GROVEDOM_BUILD_DIR ?? join(root, 'build', 'native'));
const headers = process.env.NODE_INCLUDE_DIR ?? resolve(dirname(process.execPath), '..', 'include', 'node');
const compiler = process.env.CC ?? 'clang';
const sanitize = process.env.GROVEDOM_SANITIZE === '1';
const profile = process.env.GROVEDOM_PROFILE === '1';
const optimize = process.env.GROVEDOM_OPT_LEVEL ?? '3';
const lto = process.env.GROVEDOM_LTO ?? 'thin';
const jobs = process.env.GROVEDOM_BUILD_JOBS ?? '2';
if (!/^[1-9][0-9]*$/.test(jobs)) throw new Error('Expected a positive build job count.');
if (!['2', '3', 's'].includes(optimize) || !['off', 'thin', 'full'].includes(lto)) throw new Error('Expected optimization level 2, 3, or s and LTO off, thin, or full.');
const dependency = JSON.parse(readFileSync(join(root, 'native', 'dependency.json'), 'utf8'));
if (process.platform !== 'linux') throw new Error('The initial native build supports Linux only.');
if (!source || !existsSync(join(source, 'source', 'lexbor', 'html', 'html.h'))) {
  throw new Error('Set GROVEDOM_LEXBOR_SOURCE to the reviewed Lexbor source tree from native/dependency.json.');
}
if (!existsSync(join(headers, 'node_api.h'))) throw new Error('Set NODE_INCLUDE_DIR to existing Node-API headers.');
if (!process.env.TMPDIR) throw new Error('Set TMPDIR to a disk-backed temporary directory before building.');
source = prepareDependency(source, build, join(root, 'native/dependency.json'));
mkdirSync(build, { recursive: true });
const lexborBuild = join(build, 'lexbor');
const flags = ['-fPIC', '-fvisibility=hidden'];
if (lto !== 'off') flags.push(`-flto=${lto}`);
if (sanitize) flags.push('-g', '-O1', '-fsanitize=address,undefined', '-fno-omit-frame-pointer');
function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal}).`);
}
function compilerTool(name) {
  const result = spawnSync(compiler, [`--print-prog-name=${name}`], { encoding: 'utf8' });
  if (result.error || result.status !== 0 || !result.stdout.trim()) throw new Error(`Cannot resolve ${name} from the compiler.`);
  return result.stdout.trim();
}
run('cmake', ['-S', resolve(source), '-B', lexborBuild, '-G', 'Ninja',
  ...(lto !== 'off' ? [`-DCMAKE_AR=${compilerTool('llvm-ar')}`, `-DCMAKE_RANLIB=${compilerTool('llvm-ranlib')}`] : []),
  `-DCMAKE_EXE_LINKER_FLAGS=${lto === 'off' ? '' : `-fuse-ld=lld -Wl,--threads=${jobs}`}`,
  `-DCMAKE_C_COMPILER=${compiler}`, '-DCMAKE_BUILD_TYPE=Release', `-DCMAKE_C_FLAGS_RELEASE=${sanitize ? '-O1 -DNDEBUG' : '-O3 -DNDEBUG'}`,
  `-DCMAKE_C_FLAGS=${flags.join(' ')}`, '-DLEXBOR_BUILD_SHARED=OFF',
  '-DLEXBOR_BUILD_STATIC=ON', '-DLEXBOR_WITHOUT_THREADS=ON',
  '-DLEXBOR_BUILD_TESTS=OFF', '-DLEXBOR_BUILD_EXAMPLES=OFF',
  '-DLEXBOR_BUILD_UTILS=OFF', '-DLEXBOR_BUILD_BENCHMARKS=OFF']);
run('cmake', ['--build', lexborBuild, '--target', 'lexbor_static', '--parallel', jobs]);
run(compiler, ['-std=c11', `-O${optimize}`, '-Wall', '-Wextra', ...flags, '-shared', '-DNAPI_VERSION=8',
  ...(lto !== 'off' ? ['-fuse-ld=lld', `-Wl,--threads=${jobs}`] : []),
  ...(profile ? ['-DGROVEDOM_PROFILE', '-D_POSIX_C_SOURCE=200809L', join(root, 'native/profile.c')] : []),
  '-DBUILDING_NODE_EXTENSION', '-I', headers, '-I', join(source, 'source'),
  join(root, 'native', 'addon.c'), ...['kernel', 'memory', 'nodes', 'query', 'serialize', 'attributes', 'mutate'].map(name => join(root, 'native', name + '.c')), join(root, 'native', 'xml.c'), join(root, 'native/selectors.c'), join(lexborBuild, 'liblexbor_static.a'),
  '-Wl,--exclude-libs,ALL', '-o', join(build, 'grovedom.node')]);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
writeFileSync(join(build, 'build.json'), JSON.stringify({ packageVersion: pkg.version, kernelRevision: dependency.revision, kernelSourceSha256: dependency.patchedTreeSha256 ?? dependency.sourceTreeSha256, sanitize, profile, optimize, lto }) + '\n');
console.log('Native prototype built. Use the same GROVEDOM_BUILD_DIR when running tests or benchmarks.');
