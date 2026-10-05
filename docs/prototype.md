# Setup and packages

Both packages are published at experimental 0.1.0; this page covers development
builds and package assembly. Use existing
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

Default assembly preserves `private: true`. The explicit `--publishable` mode
validates release binaries and enables publishing only in the generated packages.
The [CI/release workflow](releasing.md) packs and tests those tarballs before a
manual GitHub release or optional npm publish.

Both packages include GroveDOM's [MIT license](../LICENSE) and the
[third-party notices](../THIRD_PARTY_NOTICES.md) for the reviewed linked libraries.
Recheck those notices when changing the build's dependency revisions or libraries.

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
serialization rounds against browser DOMParser and Cheerio 1.2.0's default
parser, checking exact output equality first and rotating execution order.
Cheerio is loaded only by the demo from a versioned jsDelivr ESM URL; CDN loading
is excluded from timing. If it fails or takes more than ten seconds, the local
DOMParser comparison remains available. This does not add a package dependency
or establish an adoption multiplier.

## Checks

See [correctness testing](testing.md) for the current matrix, pinned reference
suites and browser correctness page.

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
