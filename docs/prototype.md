# Setup and packages

The repository is a development workspace, not a published release. Use existing
Node, Clang/LLVM, CMake/Ninja and reviewed Lexbor/WASI libraries. Builds install no
toolchains. Put temporary files, caches and outputs in a disk-backed scratch
location appropriate for your environment.

## Build

Developer scripts accept environment variables; **shipped runtime code does not**.
Set `TMPDIR`, `GROVEDOM_LEXBOR_SOURCE`, `GROVEDOM_BUILD_DIR`,
`GROVEDOM_WASM_BUILD_DIR`, `GROVEDOM_WASI_SYSROOT` and `GROVEDOM_WASM_BUILTINS`.
The pinned dependency is recorded in [native/dependency.json](../native/dependency.json).

```sh
npm run build:native
npm run build:wasm
node scripts/package-targets.mjs --out=/scratch/packages --wasm=/scratch/wasm --native=/scratch/native
```

Use a **new** output directory. Packaging creates independent `grovedom` and
`grovedom-native` directories plus a demo. It copies the same Wasm binary for Node
and browser use and bakes build constants into ESM. Native packages contain no
Wasm runtime; the main package contains no addon or native loader. Neither ships
diagnostics, source/build JSON manifests or environment-based runtime loaders.
Nothing is published by these commands. `npm pack --pack-destination=DIR` can
produce a tarball from either generated package.

Neither package has runtime or peer dependencies. Declarations define GroveDOM's
supported options, callbacks and helpers locally, so TypeScript consumers do not
need Cheerio. The repository retains Cheerio only for development comparisons.

Release defaults: O3/ThinLTO, optional source target features off, 1 MiB initial
Wasm memory, 32 KiB linear stack, 16 KiB transfer scratch. Compiler flags remain
build-time choices. A build emits an ESM constants file used during packaging;
release loading does not inspect metadata or compare package versions.

## Runtime initialization

```js
import { init, load } from 'grovedom';
init({ wasm: '/application/assets/grovedom.wasm', heap: 'pool' });
const $ = load('<p>Hello</p>');
try { console.log($('p').text()); } finally { $.dispose(); }
```

Node `init` is synchronous. Omitting it loads the bundled Wasm on first DOM use.
`wasm` accepts a local path, file URL, byte array, ArrayBuffer or compiled module.
Pool defaults are eight idle instances and 16 MiB total idle memory. `poolSize`
and `poolMaxBytes` are nonnegative integers; zero disables idle retention.
`heap` may be `pool`, `global` or `document`.

```js
import { init, load } from 'grovedom-native';
init({ addon: '/application/native/grovedom.node' }); // optional custom location
```

Native defaults to its bundled addon. Package entries own independent state and
handle brands. Configuration cannot change after successful initialization,
including implicit initialization through `load`, `contains` or `merge`.
Failed initialization can be retried. No package metadata compatibility check
is performed: distribute the matching JS and artifact together.

## Browser and demo

```js
import { init, load } from 'grovedom/browser';
await init({ wasm: new URL('./grovedom.wasm', import.meta.url) });
```

The browser entry requires explicit async initialization. It fetches bytes and
uses `WebAssembly.compile`, without requiring streaming compilation or a specific
Wasm MIME type. DOM calls are synchronous afterward. Concurrent/repeated init
calls are rejected; await the original call. URL fetching follows browser CORS
and CSP rules. This is best-effort support, not a tested browser-version matrix.

```sh
node scripts/serve-demo.mjs /scratch/packages 8080
```

Open the printed loopback URL. The demo compares three short parsing/query/edit/
serialization pairs against browser DOMParser, checking output equality first.
It does not compare Cheerio or establish an adoption multiplier.

## Checks

`npm test` uses developer-only diagnostic entries. Select backend/heap with
`GROVEDOM_BACKEND=napi|wasm` and `GROVEDOM_WASM_HEAP=pool|global|document`.
Build locations use the variables above. `GROVEDOM_TEST_BROWSER=1` exercises the
portable byte path under Node. `node --experimental-vm-modules
test/browser-sandbox.mjs` checks the browser ESM graph without Node globals; it
is not a browser-engine test.

`npm run test:types` reuses an existing compiler (`GROVEDOM_TSC`).
After package assembly, `node scripts/check-package-types.mjs /scratch/packages`
checks isolated downstream Node and browser imports with no third-party types;
set `TMPDIR` for its temporary project. Declaration checking stays enabled.
`npm run test:fuzz` runs deterministic mutation replays; use disk-backed
`GROVEDOM_FUZZ_DIR` for reproducers. Native sanitizer builds use a separate build
directory and `GROVEDOM_SANITIZE=1`. `scripts/check-faults.mjs` tests owned buffer
allocation failures with sanitizers and a separate `GROVEDOM_FAULT_BUILD_DIR`.
See [benchmarks](benchmarks.md) for short measurement rules and
[compatibility](compatibility.md) for supported versus best-effort behavior.

The refactor checkpoint passed the 729-case matrix: native 712 passes/17 skips,
shared Wasm 714/15, fresh Wasm 715/14 and pooled Wasm 718/11. Native/pool also
pass Node 24. Public entries match all nineteen consumer outputs/events; type
checks, native ASan/UBSan with leak detection, owned buffer failure injection and
1,200 additional deterministic fuzz cases pass. Separate target packages load on
Node 22/24 without build metadata. Portable browser checks include missing
FinalizationRegistry and TextEncoder.encodeInto fallbacks; actual browsers and
the exact Node 22.0.0 floor remain untested.
