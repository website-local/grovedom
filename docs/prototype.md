# Runnable prototypes

GroveDOM has a shared C/Lexbor kernel, thin Node-API and direct Wasm bindings, and a Cheerio-shaped ESM facade. These are experimental candidates, not a selected production backend or a complete Cheerio replacement. Performance on normal successful workloads is the first priority. Exact invalid-input behavior and error-message parity are not adoption gates; correct successful results and memory safety remain required.

## Build and run

Use Node.js >=22.0.0 and existing C11/Clang, LLVM linker/archive tools, CMake, and Ninja installations. Native builds currently target Linux and need Node-API headers. Wasm additionally needs wasm-ld, a WASI sysroot/libc, and compatible compiler builtins. Scripts install nothing and use no Python, node-gyp, Emscripten, or binding generator.

Set locations using environment variables; keep downloads, caches, build products, logs, profiles, and private corpus manifests outside public repository content:

| Variable | Purpose |
|---|---|
| `TMPDIR`, `TMP`, `TEMP`, `npm_config_cache` | Disk-backed temporary storage and cache |
| `GROVEDOM_LEXBOR_SOURCE` | Clean reviewed source from `native/dependency.json` |
| `GROVEDOM_BUILD_DIR` | Native build output; reuse when running |
| `NODE_INCLUDE_DIR`, `CC` | Optional existing Node headers and C compiler |
| `GROVEDOM_WASI_SYSROOT` | Existing WASI sysroot |
| `GROVEDOM_WASM_BUILTINS` | Existing Wasm compiler builtins archive |
| `GROVEDOM_WASM_BUILD_DIR` | Wasm build output; reuse when running |
| `GROVEDOM_TSC` | Existing TypeScript compiler entry for declaration checks |
| `GROVEDOM_OPT_LEVEL` | Kernel/binding optimization: `2`, `3` (default), or `s`; Lexbor remains O3 |
| `GROVEDOM_LTO` | `off`, `thin` (default), or `full`, applied to kernel and Lexbor |
| `GROVEDOM_BUILD_JOBS` | Positive compiler/linker concurrency limit; default two |
| `GROVEDOM_PROFILE` | Set to `1` for diagnostic phase clocks/counters; omitted in release builds |
| `GROVEDOM_WASM_FEATURES` | Optional comma-separated `bulk-memory`, `simd128`, `relaxed-simd`, `tail-call`, `nontrapping-fptoint`; default empty |

The build verifies the reviewed Lexbor source fingerprint. This checks build inputs and adds nothing to the private command protocol. JS and kernel artifacts are paired using build/package metadata; there is no stable internal ABI or protocol version/checksum.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build:native
npm test
npm run test:types
npm run build:wasm
GROVEDOM_BACKEND=wasm GROVEDOM_WASM_HEAP=global npm test
GROVEDOM_BACKEND=wasm GROVEDOM_WASM_HEAP=document npm test
GROVEDOM_BACKEND=wasm GROVEDOM_WASM_HEAP=pool npm test
node bench/compare.mjs
```

The native backend is the default. The Wasm adapter uses `WebAssembly.Module`/`Instance` directly, with no emulated Node-API layer or experimental Node WASI API. **Release Wasm modules have zero imports**, including no `wasi_snapshot_preview1` functions or descriptor stubs. The build checks this invariant; diagnostic builds may import only their explicit timing hooks. The current JS adapter targets Node, not browsers.

```js
import { load } from 'grovedom';
const $ = load('<p class="intro">Hello</p>');
try {
  $('p').addClass('offline').wrap('<section></section>');
  console.log($.html());
} finally {
  $.dispose();
}
```

Default execution buffers mutations in one document-wide ordered stream. Selectors materialize snapshots when issued. Reads, including live node getters inside callbacks, flush earlier mutations; callbacks receiving only snapshot identities need no separate entry flush. Pending writes and their following read share a Node-API call. `$.flush()` is available. `{ execution: 'direct' }` disables buffering for comparison. Calls are synchronous on either the main thread or a caller-managed worker. Documents stay within their creating environment; the library creates no threads.

## API coverage

| Area | Implemented methods/behavior |
|---|---|
| Loading | HTML strings; document/body-context fragment modes; `scriptingEnabled`, `baseURI`; markup construction and initialization objects through `$` |
| Collections | Indexing, iteration, `get`, `toArray`, `eq`, `first`, `last`, `slice`, `each`, `map`, `end` |
| Traversal | `find`, `children`, `contents`, `parent`, `parents`, `closest`, `siblings`, `next`/`prev`, `nextAll`/`prevAll`, `nextUntil`/`prevUntil`/`parentsUntil` |
| Selection | `filter`, `not`, `is`, `has`, `add`, `addBack`, `index`; common trailing positional pseudos |
| Attributes/data | `attr`, `removeAttr`, class helpers, `data`, `removeData`, `css`, `val` |
| Mutation | `text`, `html`, `append`/`prepend`, `before`/`after`, insertion-to helpers, `remove`, `detach`, `empty`, `clone`, `replaceWith`, wrapping helpers |
| Properties | Common property reads; tag rename, text/HTML setters and attribute-backed writes |
| Extraction | `serialize`, `serializeArray`, `extract`; static `html`, `text`, `root`, `contains`, `parseHTML`, `extract`, `load` |
| Raw handles | Stable identity; name/tag rename, type, relatives, child arrays, character data, live attribute map |
| Lifecycle | Explicit idempotent `dispose`, backend GC fallback, `flush` |

This is selected, tested behavior, not blanket equivalence for every overload. Cheerio's public `FilterFunction`, `SelectorType`, and option types are reused. GroveDOM declarations describe its own handles instead of pretending they are complete domhandler nodes. Callback, mapping, extraction, and lifecycle examples have separate TypeScript checks. Cheerio is a pinned type peer/development baseline; runtime code does not import it.

Remaining exclusions include template contents, XML, buffer/stream/network loading, arbitrary serializer options, custom pseudos/plugins, general relative selectors and nested Cheerio-only pseudos, cross-document node adoption, and unrestricted domhandler mutation. Template-containing documents currently fail facade loading explicitly. Unknown parser options and selectors fail explicitly; there is no silent Cheerio fallback. Plain CSS goes directly to Lexbor. Common trailing `:first`, `:last`, `:eq`, `:nth`, `:lt`, `:gt`, `:even`, and `:odd` are handled over selection results; this is not a general selector-extension engine.

Additional edge semantics still need consumer coverage, including disabled-fieldset form behavior, namespace changes during rename, detached/mixed-root ordering, and all arbitrary property combinations. `add` sorts connected nodes in tree order and groups disconnected roots by first occurrence. Child arrays are snapshots, not writable live domhandler arrays. Mutations must go through supported methods or supported node setters.

The published engine 0.9.1 and representative MDN APIs have been inventoried. Many previously missing wrapping/moving/renaming/class/mapping primitives now exist, but the actual engine adapter, its internal nested-document imports, option handling, and full replay remain unimplemented. That adapter should own disposal in `finally`, including nested documents.

## Wasm ownership and memory

All modes reuse one compiled module per caller environment:

| Mode | Ownership and disposal | Retention |
|---|---|---|
| `global` | One instance serves several document arenas; explicit disposal/finalizer frees each arena | Linear-memory high-water capacity stays reusable but cannot shrink |
| `document` | Fresh instance per DOM; explicit disposal clears owner references; host GC reclaims backing memory | Instantiation repeats; physical reclamation can lag disposal |
| `pool` | One document per checked-out instance; disposal or registry fallback returns an empty instance | Idle instances are bounded and reusable; overflow is dropped for host GC |

The pool defaults to four idle instances and 16 MiB **total idle linear memory**. Configure `GROVEDOM_WASM_POOL_SIZE` and `GROVEDOM_WASM_POOL_MAX_BYTES`; either can be zero. Active documents are not capped by these limits. Oversized/overflow instances are not retained in the pool. Private diagnostic `kernel.trim()` drops idle instances; it cannot shrink shared memory or force host GC. Pooling involves no threads, scheduler, shared-document access, or custom allocator.

The default initial heap is 2 MiB, including the 1 MiB stack and static data; maximum linear memory is 2 GiB. Initial-size experiments use the build-time `GROVEDOM_WASM_INITIAL_PAGES` setting, in 64 KiB pages. It must be linked into the module: with this WASI libc, simply providing a larger imported memory leaves additional initial capacity outside the allocator's known region. No input-size heuristic is enabled; measured growth did not dominate lifetime cost. See [the benchmark evidence](benchmarks.md#wasm-heap-and-profile-diagnostics).

The core tracks backing allocations, reuses geometrically grown buffers, caps selector plans at 32, reuses existing attribute/text capacity where possible, and returns unobserved removed subtrees to document pools. Node IDs are not recycled while a document lives. Observed detached nodes stay valid until disposal. Renaming retains the previous empty interface in the document arena because parser side pointers may still refer to it; repeated rename retention remains a limitation to address if material in the real workload.

Native allocation scopes/counters are thread-local. The Linux loader installs Lexbor's process-wide allocator hooks once, before concurrent environments use them. Native external-memory accounting updates at call boundaries. Wasm refreshes views after calls that can grow memory and copies caller-visible outputs. No per-node finalizers or cross-language reference counts are introduced.

Explicit disposal discards pending work and invalidates retained handles. GC fallback is secondary: native owner finalization, registry cleanup for shared/pooled Wasm, host ownership for fresh instances. Registry-held records do not retain their owner targets. Live selections keep documents alive until explicit disposal or abandonment of the complete ownership graph.

## Verification and diagnostics

The tests include authored Cheerio differential cases, [selected upstream Cheerio/jQuery suites](../test/upstream/README.md), worker/lifecycle checks, and pool reuse/cap/GC tests. Run each Wasm mode explicitly. The current 456-case matrix passes: 444 tests on native/shared/fresh Wasm with 12 visible skips, and 447 on pooled Wasm with nine upstream exclusions. Three pool-specific cases run only in pool mode. Native and pooled Wasm also pass on Node 24; native ASan/UBSan with leak detection passes all 444 applicable tests. These checks cover the implemented paths; the exact Node 22.0.0 floor, allocation-failure injection, and broader fuzzing remain release work. Sanitizers do not establish absence of data races or allocator fragmentation.

For sanitizer builds use a separate `GROVEDOM_BUILD_DIR`, set `GROVEDOM_SANITIZE=1`, and run with the matching existing Clang ASan runtime, leak detection, and disk-backed log locations. Keep sanitizer results separate from release timing.

`bench/run.mjs` compares direct/buffered GroveDOM with both Cheerio parsers on an authored replay; `bench/compare.mjs` runs all four backend/heap cases. `bench/memory.mjs` requires `--expose-gc` and records large-then-small/interleaved lifetimes. `bench/profile.mjs` isolates the candidate for Node's `--cpu-prof`, with `--cpu-prof-dir` pointing to disk-backed scratch storage.

### Phase profiling and compiler experiments

Build with `GROVEDOM_PROFILE=1`, then run `node bench/phase-profile.mjs`. For Wasm add `GROVEDOM_BACKEND=wasm GROVEDOM_WASM_HEAP=global`; one persistent runtime keeps core counters available throughout the measurement. Separate lifecycle benchmarks compare the three heap policies. Use separate build directories for profiling and release artifacts.

The profile reports inclusive/exclusive phase time, boundary calls, commands, selector hits/misses, allocation requests, and output chunks/bytes. Native x86 uses fenced reference-TSC reads calibrated against a monotonic OS clock; these are elapsed reference ticks, not retired instructions or core cycles. Other native targets use the monotonic clock. Wasm imports a host clock. Empty-scope and JS-wrapper calibration accompany each report. Tiny Wasm phase timings include substantial clock-import overhead; instrumented elapsed time is never a release speedup measurement. Native records and stack scopes are thread-local and allocate no heap storage per event. Release builds omit the clocks and counters.

`bench/ab.mjs` checks exact output before alternating release timing. Supply `GROVEDOM_AB_MANIFEST` with `variants: [{ name, entry, env }]`; every entry must point to an isolated source snapshot with its matching kernel artifact. An optional `corpus: [{ id, path }]` selects private input files. The default uses the authored replay. Reports emit labels and raw samples without paths. Configure rounds, iterations, and authored article count with `GROVEDOM_BENCH_ROUNDS`, `GROVEDOM_BENCH_ITERATIONS`, and `GROVEDOM_BENCH_ROWS`.

The measured default is O3 plus ThinLTO. Native LTO uses lld; both builds resolve matching LLVM archive tools through Clang. `GROVEDOM_LTO=off` retains a straightforward non-LTO build for comparison. No CPU-specific instruction flags or profile-guided training corpus are baked into artifacts. See [the measurements](benchmarks.md#deep-profiling-and-compiler-tuning) for scope and variability.

Wasm feature flags apply to both Lexbor and the kernel, including the LTO link. An empty `GROVEDOM_WASM_FEATURES` keeps compiler defaults; it does not disable features already present in the prebuilt libc. For example, `GROVEDOM_WASM_FEATURES=bulk-memory,simd128` enables explicit bulk operations and automatic vectorization in our sources. The [feature sweep](benchmarks.md#wasm-target-features-and-removal-of-wasi-imports) found no repeatable overall win, so additional features remain opt-in. There is no runtime feature dispatcher or extra artifact set.

The former WASI descriptor imports came from the kernel's mutation-error `snprintf` call, which pulled in libc's general stdio implementation. A bounded integer formatter now writes into the existing document error buffer. The linker discards the unused stdio dependency; no permissive unresolved-symbol policy, syscall wrappers, or suppressed output are needed. Error codes, operation indices, and preceding mutation effects remain intact.

For heap diagnostics, set `GROVEDOM_WASM_PROFILE_GROWTH=1` while building and running. This produces a separate instrumented module. `bench/heap-growth.mjs` reads `GROVEDOM_HTML_MANIFEST`, a private JSON array of `{ "id": "page-label", "path": "input-file" }`. File paths/content are not emitted. `GROVEDOM_HEAP_WORKLOAD=parse` uses a diagnostic-only entry point to parse unmodified pages including templates, then dispose; it does not expose a template DOM or establish facade compatibility. Default mode includes selection, mutation and serialization and reports unsupported pages explicitly. Rebuild for every initial-size setting. Release builds contain no growth-clock instrumentation or template-probe entry point.

A zero live-byte counter after disposal is not proof of prompt OS reclamation, zero arena slack, or absence of fragmentation. Full-workload budgets, sustained mixed-size reuse, the complete engine replay, and the fastest-compatible-baseline audit remain adoption work. Rust remains an unmeasured candidate. No package or repository has been published.
