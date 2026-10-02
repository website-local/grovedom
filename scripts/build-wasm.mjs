import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sourceFingerprint } from './source-fingerprint.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = process.env.GROVEDOM_LEXBOR_SOURCE;
const sysroot = process.env.GROVEDOM_WASI_SYSROOT;
const builtins = process.env.GROVEDOM_WASM_BUILTINS;
const build = resolve(process.env.GROVEDOM_WASM_BUILD_DIR ?? join(root, 'build/wasm'));
const compiler = process.env.CC ?? 'clang';
const profileGrowth = process.env.GROVEDOM_WASM_PROFILE_GROWTH === '1';
const profile = process.env.GROVEDOM_PROFILE === '1';
const optimize = process.env.GROVEDOM_OPT_LEVEL ?? '3';
const lto = process.env.GROVEDOM_LTO ?? 'thin';
const jobs = process.env.GROVEDOM_BUILD_JOBS ?? '2';
if (!/^[1-9][0-9]*$/.test(jobs)) throw new Error('Expected a positive build job count.');
if (!['2', '3', 's'].includes(optimize) || !['off', 'thin', 'full'].includes(lto)) throw new Error('Expected optimization level 2, 3, or s and LTO off, thin, or full.');
const flags = lto === 'off' ? [] : [`-flto=${lto}`];
const initialPages = Number(process.env.GROVEDOM_WASM_INITIAL_PAGES ?? 32);
if (!Number.isInteger(initialPages) || initialPages < 32 || initialPages > 32768) throw new Error('Initial Wasm pages must be between 32 and 32768.');
const dependency = JSON.parse(readFileSync(join(root, 'native/dependency.json'), 'utf8'));
if (!process.env.TMPDIR) throw new Error('Set TMPDIR to a disk-backed temporary directory.');
if (!source || sourceFingerprint(source) !== dependency.sourceTreeSha256) throw new Error('Set GROVEDOM_LEXBOR_SOURCE to the reviewed source tree.');
if (!sysroot || !existsSync(sysroot) || !builtins || !existsSync(builtins)) throw new Error('Set GROVEDOM_WASI_SYSROOT and GROVEDOM_WASM_BUILTINS to existing Wasm runtime libraries. No toolchain is installed by this script.');
mkdirSync(build, { recursive: true });
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
const lexborBuild = join(build, 'lexbor');
const target = ['--target=wasm32-wasi', `--sysroot=${resolve(sysroot)}`];
run('cmake', ['-S', resolve(source), '-B', lexborBuild, '-G', 'Ninja',
  ...(lto !== 'off' ? [`-DCMAKE_AR=${compilerTool('llvm-ar')}`, `-DCMAKE_RANLIB=${compilerTool('llvm-ranlib')}`] : []),
  '-DCMAKE_SYSTEM_NAME=Generic', '-DCMAKE_SYSTEM_PROCESSOR=wasm32', '-DCMAKE_TRY_COMPILE_TARGET_TYPE=STATIC_LIBRARY',
  `-DCMAKE_C_COMPILER=${compiler}`, '-DCMAKE_BUILD_TYPE=Release',
  `-DCMAKE_C_FLAGS=${[...target, ...flags, '-fvisibility=hidden'].join(' ')}`, '-DCMAKE_C_FLAGS_RELEASE=-O3 -DNDEBUG',
  '-DLEXBOR_BUILD_SHARED=OFF', '-DLEXBOR_BUILD_STATIC=ON', '-DLEXBOR_WITHOUT_THREADS=ON',
  '-DLEXBOR_BUILD_TESTS=OFF', '-DLEXBOR_BUILD_EXAMPLES=OFF', '-DLEXBOR_BUILD_UTILS=OFF', '-DLEXBOR_BUILD_BENCHMARKS=OFF']);
run('cmake', ['--build', lexborBuild, '--target', 'lexbor_static', '--parallel', jobs]);
const exports = ['gk_init', 'gk_new', 'gk_dispose', 'gk_delete', 'gk_input', 'gk_transfer', 'gk_parse',
  'gk_query', 'gk_read', 'gk_traverse', 'gk_edit', 'gk_execute', 'gk_stats', 'gk_error_code', 'gk_error_message'];
run(compiler, [...target, ...flags, '-std=c11', `-O${optimize}`, '-Wall', '-Wextra', '-fvisibility=hidden', '-nostartfiles', '-nodefaultlibs',
  '-I', join(source, 'source'), join(root, 'native/kernel.c'), join(lexborBuild, 'liblexbor_static.a'),
  ...(profileGrowth ? ['-DGROVEDOM_PROFILE_GROWTH', join(root, 'native/wasm-growth.c'), '-Wl,--wrap=sbrk', '-Wl,--export=gk_parse_profile'] : []),
  ...(profile ? ['-DGROVEDOM_PROFILE', join(root, 'native/profile.c'), ...['snapshot', 'name', 'count', 'reset', 'probe'].map(name => `-Wl,--export=gk_profile_${name}`)] : []),
  `-Wl,--threads=${jobs}`, '-Wl,--no-entry', '-Wl,--export-memory', '-Wl,--stack-first', '-Wl,-z,stack-size=1048576',
  `-Wl,--initial-memory=${initialPages * 65536}`, '-Wl,--max-memory=2147483648',
  ...exports.map(name => `-Wl,--export=${name}`), '-lc', '-lm', resolve(builtins), '-o', join(build, profileGrowth ? 'grovedom-growth.wasm' : 'grovedom.wasm')]);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
writeFileSync(join(build, profileGrowth ? 'growth-build.json' : 'build.json'), JSON.stringify({ packageVersion: pkg.version, kernelRevision: dependency.revision, initialPages, profile, optimize, lto }) + '\n');
console.log('Wasm prototype built. Reuse GROVEDOM_WASM_BUILD_DIR with GROVEDOM_BACKEND=wasm.');
