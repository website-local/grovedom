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
| `GROVEDOM_WASM_INITIAL_PAGES` | Initial linear memory in 64 KiB pages; default 16 |
| `GROVEDOM_WASM_STACK_BYTES` | Linear-memory stack reservation; default 65,536 bytes |
| `GROVEDOM_WASM_PROFILE_STACK` | Set to `1` to export stack globals for the separate diagnostic |

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
| Loading | HTML/XML strings and UTF-8 Buffers; XML SVG/sitemaps; document/body-context fragment modes; `scriptingEnabled`, `baseURI`; markup construction and initialization objects through `$` |
| Collections | Indexing, iteration, `get`, `toArray`, `eq`, `first`, `last`, `slice`, `splice`, `each`, `map`, `end` |
| Traversal | `find`, `children`, `contents`, `parent`, `parents`, `closest`, `siblings`, `next`/`prev`, `nextAll`/`prevAll`, `nextUntil`/`prevUntil`/`parentsUntil` |
| Selection | `filter`, `not`, `is`, `has`, `add`, `addBack`, `index`; common trailing positional pseudos; leading relative query chains and `:scope` |
| Attributes/data | `attr`, `removeAttr`, class helpers, `data`, `removeData`, `css`, `val` |
| Mutation | `text`, `html`, `append`/`prepend`, `before`/`after`, insertion-to helpers, `remove`, `detach`, `empty`, `clone`, `replaceWith`, wrapping helpers |
| Properties | Common property reads; tag rename, text/HTML setters and attribute-backed writes |
| Extraction | `serialize`, `serializeArray`, `extract`; static `html`, `xml`, `text`, `root`, `contains`, `merge`, `parseHTML`, `extract`, `load` |
| Raw handles | Stable identity; name/tag rename, type, relatives, child arrays, character data, live attribute map |
| Lifecycle | Explicit idempotent `dispose`, backend GC fallback, `flush` |

This is selected, tested behavior, not blanket equivalence for every overload. Cheerio's public `FilterFunction`, `SelectorType`, and option types are reused. GroveDOM declarations describe its own handles instead of pretending they are complete domhandler nodes. Callback, mapping, extraction, and lifecycle examples have separate TypeScript checks. Cheerio is a pinned type peer/development baseline; runtime code does not import it.

Remaining exclusions include encoding-sniffing `loadBuffer`, stream/network loading, arbitrary serializer options, custom pseudos/plugins, relative selectors in filters and mixed child/sibling relative lists, nested Cheerio-only pseudos, cross-document node adoption, and unrestricted domhandler mutation. See the [compatibility inventory](compatibility.md) for the complete public API boundary. Unknown parser options and selectors fail explicitly; there is no silent Cheerio fallback. Plain CSS goes directly to Lexbor. Common trailing `:first`, `:last`, `:eq`, `:nth`, `:lt`, `:gt`, `:even`, and `:odd` are handled over selection results; this is not a general selector-extension engine.

Additional edge semantics still need consumer coverage, including namespace changes during rename, arbitrary mixed-root ordering, and all arbitrary property combinations. Differential checks now cover missing/selected option values, successful form serialization (including Cheerio's disabled-fieldset behavior), supported URL properties and connected/detached-subtree ordering. Explicit namespace writes remain unsupported. `add` sorts connected nodes in tree order and groups disconnected roots by first occurrence. Child arrays are snapshots, not writable live domhandler arrays. Mutations must go through supported methods or supported node setters.

An isolated engine 0.9.1/MDN replay now executes real DOM transforms through an engine-side disposal scope, including nested documents and serialization. Seven authored scenarios and eight saved pages match Cheerio output and ordered resource events. It stubs resource I/O and URL policies, and does not run the complete downloader. Cross-document adoption is deferred after the consumer audit. See [integration](integration.md).

## Templates and expanded compatibility

HTML templates expose a fragment child through `contents()`, with stable handles and normal document ownership. Queries, text reads, cloning, fragment mutations, retained detached contents, and disposal have differential/lifecycle coverage. As in Cheerio, `template.find(...)` starts at element children; use `template.contents().find(...)` to query its content. Selector ancestry and `parents`/`closest` stop at the fragment, while raw parent links and `contains` preserve its connection.

Ordinary CSS on template documents uses Lexbor subtree scans with fragment matches merged in preorder, avoiding a fresh evaluator call for every element. Entirely element-scoped queries exclude fragment descendants, matching Cheerio. CSS `:has`, `:empty` and `:contains` use a compatibility evaluator when necessary, with bounded selector recursion and reusable text storage. Common Cheerio form aliases are expanded and cached; ordinary non-template CSS keeps its existing kernel path.

Serialization uses an iterative walk around Lexbor's node serializer, preserving template containers and Cheerio's attribute escaping. It leaves angle brackets literal inside attribute values while still escaping quotes, ampersands and nonbreaking spaces. HTML getters do not reproduce Cheerio's incidental mutation of template child arrays. All eight selected unmodified MDN pages now match Cheerio's parse and authored-replay output; this is not the complete engine replay.

The expansion also corrects multi-node ancestor order, wrapping overloads, empty-selection property reads, `insertBefore`/`insertAfter` clone identity, and `addBack` without a prior selection. `splice` and `merge` change selection membership without modifying the DOM or earlier snapshots. Top-level `contains` and `merge` are exported; `merge` reuses Cheerio's declaration directly.

Repeated unobserved subtree replacement now explicitly frees attributes before invoking specialized Lexbor HTML destructors. Those destructors omit the shared element attribute cleanup, which previously caused arena growth on repeated attribute-bearing replacements. Observed nodes remain retained until disposal.

XML is implemented in the shared kernel for SVG and sitemaps, with case-sensitive names, qualified attributes, entities, CDATA, declarations, fragment mutation and serialization. It uses the same arenas, ordered operations, handles and disposal paths; no additional dependency or toolchain is needed. See the [XML contract](compatibility.md#xml-svg-and-sitemaps) for supported load options and intentional limits.

## Wasm ownership and memory

All modes reuse one compiled module per caller environment:

| Mode | Ownership and disposal | Retention |
|---|---|---|
| `global` | One instance serves several document arenas; explicit disposal/finalizer frees each arena | Linear-memory high-water capacity stays reusable but cannot shrink |
| `document` | Fresh instance per DOM; explicit disposal clears owner references; host GC reclaims backing memory | Instantiation repeats; physical reclamation can lag disposal |
| `pool` | One document per checked-out instance; disposal or registry fallback returns an empty instance | Idle instances are bounded and reusable; overflow is dropped for host GC |

The pool defaults to four idle instances and 16 MiB **total idle linear memory**. Configure `GROVEDOM_WASM_POOL_SIZE` and `GROVEDOM_WASM_POOL_MAX_BYTES`; either can be zero. Active documents are not capped by these limits. Oversized/overflow instances are not retained in the pool. Private diagnostic `kernel.trim()` drops idle instances; it cannot shrink shared memory or force host GC. Pooling involves no threads, scheduler, shared-document access, or custom allocator.

The default initial linear memory is **1 MiB**, including a **64 KiB stack**, static data, and **16 KiB transfer scratch**; maximum linear memory is 2 GiB. The former reservation was 2 MiB with a 1 MiB stack. Initial-size experiments use the build-time `GROVEDOM_WASM_INITIAL_PAGES` setting, in 64 KiB pages; `GROVEDOM_WASM_STACK_BYTES` sets the stack separately. They must be linked into the module: with this WASI libc, simply providing a larger imported memory leaves additional initial capacity outside the allocator's known region. No input-size heuristic is enabled; measured growth did not dominate lifetime cost. See [the stack and transfer measurements](benchmarks.md#wasm-stack-and-transfer-storage).

Each instance shares its fixed transfer area across synchronous calls for all of its documents. Small transfers avoid a per-document allocation and a `gk_transfer` call; larger transfers retain the existing document-owned buffer. Pending JS operations remain per-document, preserving nested calls, interleaved documents, and discard-on-disposal behavior. Each returned selection/string still owns its data. The Node Wasm adapter caches a `Buffer` view of memory and decodes strings directly from its range, avoiding a temporary subarray for each result and preserving leading BOM characters. Growth refreshes the view; disposal clears it.

The core tracks backing allocations, reuses geometrically grown buffers, caps selector plans at 32, reuses existing attribute/text capacity where possible, and returns unobserved removed subtrees to document pools. Cached selector keys and parsed plans share one document-owned CSS arena, created on first use. A miss after 32 entries resets the whole cache; failed parses also reset it. Parser selector state is reused. Plans never escape a synchronous query, so resetting them preserves selection snapshots and node identity. Node IDs are not recycled while a document lives. Observed detached nodes stay valid until disposal. Renaming retains the previous empty interface in the document arena because parser side pointers may still refer to it; repeated rename retention remains a limitation to address if material in the real workload.

Native allocation scopes/counters are thread-local. The Linux loader installs Lexbor's process-wide allocator hooks once, before concurrent environments use them. Native external-memory accounting updates at call boundaries. Wasm reuses byte/word transfer views, refreshing them after allocating exports and growth by other documents in the shared heap. Disposal clears cached views as well as the runtime reference. Caller-visible outputs are copied. Short ASCII inputs avoid temporary encoder views/results; other strings still use UTF-8 encoding. No per-node finalizers or cross-language reference counts are introduced.

Explicit disposal discards pending work and invalidates retained handles. GC fallback is secondary: native owner finalization, registry cleanup for shared/pooled Wasm, host ownership for fresh instances. Registry-held records do not retain their owner targets. Live selections keep documents alive until explicit disposal or abandonment of the complete ownership graph.

## Verification and diagnostics

The tests include authored Cheerio differential cases, [selected upstream Cheerio/jQuery suites](../test/upstream/README.md), worker/lifecycle checks, pool reuse/cap/GC tests, selector-cache resets, and Wasm growth/disposed-buffer regressions. Run each Wasm mode explicitly. The current 696-case matrix includes 618 imported upstream cases. The applicable tests pass across native and all three Wasm heaps; backend-specific skips and 11 upstream exclusions are reported separately. Skips include the documented upstream exclusions and tests specific to other backends/heap modes. The 695-case baseline also passes on Node 24 with native and pooled Wasm; native ASan/UBSan with leak detection passes the suite and additional empty-snapshot regression. These checks cover the implemented paths; the exact Node 22.0.0 floor, allocation-failure injection, and broader fuzzing remain release work. Sanitizers do not establish absence of data races or allocator fragmentation. See [memory](memory.md) for sustained lifetime measurements and scoped capacity budgets.

For sanitizer builds use a separate `GROVEDOM_BUILD_DIR`, set `GROVEDOM_SANITIZE=1`, and run with the matching existing Clang ASan runtime, leak detection, and disk-backed log locations. Keep sanitizer results separate from release timing.

`bench/run.mjs` compares direct/buffered GroveDOM with both Cheerio parsers on an authored replay; `bench/compare.mjs` runs all four backend/heap cases. `bench/memory.mjs` requires `--expose-gc` and records large-then-small/interleaved lifetimes. `bench/profile.mjs` isolates the candidate for Node's `--cpu-prof`, with `--cpu-prof-dir` pointing to disk-backed scratch storage.

`bench/allocations.mjs` records one authored replay's backing allocation requests and post-disposal counters without timing. Run it in a fresh process for each source/artifact pair; use shared Wasm for its core peak-byte counter. Fresh/pooled Wasm statistics sample live bytes only, so their reported `peakBytes` can miss a completed lifecycle. These counters exclude JS allocations and allocator slack.

### Phase profiling and compiler experiments

Build with `GROVEDOM_PROFILE=1`, then run `node bench/phase-profile.mjs`. For Wasm add `GROVEDOM_BACKEND=wasm GROVEDOM_WASM_HEAP=global`; one persistent runtime keeps core counters available throughout the measurement. Separate lifecycle benchmarks compare the three heap policies. Use separate build directories for profiling and release artifacts.

The profile reports inclusive/exclusive phase time, boundary calls, commands, selector hits/misses, allocation requests, and output chunks/bytes. Native x86 uses fenced reference-TSC reads calibrated against a monotonic OS clock; these are elapsed reference ticks, not retired instructions or core cycles. Other native targets use the monotonic clock. Wasm imports a host clock. Empty-scope and JS-wrapper calibration accompany each report. Tiny Wasm phase timings include substantial clock-import overhead; instrumented elapsed time is never a release speedup measurement. Native records and stack scopes are thread-local and allocate no heap storage per event. Release builds omit the clocks and counters.

`bench/ab.mjs` checks exact output before alternating release timing. Supply `GROVEDOM_AB_MANIFEST` with `variants: [{ name, entry, env }]`; every entry must point to an isolated source snapshot with its matching kernel artifact. An optional `corpus: [{ id, path }]` selects private input files. The default uses the authored replay. Reports emit labels and raw samples without paths. Configure rounds, iterations, and authored article count with `GROVEDOM_BENCH_ROUNDS`, `GROVEDOM_BENCH_ITERATIONS`, and `GROVEDOM_BENCH_ROWS`.

`bench/short.mjs` uses that manifest with exactly two variants for repeated short batches. Each retained/rejected block includes both ABBA and BAAB halves, giving each variant the first position after an event-loop yield. Defaults are 60 balanced blocks, 12 replays per batch, and 200 warmups per variant. For larger pages, reduce the iteration count to keep individual batches short. Parsing, mutation, serialization, explicit disposal, and any GC during a batch remain inside its wall time; there is no forced GC.

An optional `workload` module in the short-run manifest exports `page(rows)` and `replay(load, source)`. Use `bench/xml-fixtures.mjs` for the authored sitemap/SVG replay and generate its `page`/`svg` inputs into disk-backed scratch for the manifest's corpus. Its baseline is Cheerio `{ xml: true }`, which uses htmlparser2; parse5 has no XML mode. Always check exact output before timing.

A separate integer-loop CPU probe runs before and after each batch. Reject a whole balanced block only when its maximum/minimum probe time exceeds 1.5. The filter never inspects either variant's elapsed time or their ratio. Calibration samples are diagnostic only: a fixed absolute cutoff can misclassify a steady change in the probe's own speed. Reports retain all raw blocks, rejection counts, both filtered and unfiltered summaries, and results by starting order. The filter detects some transient interference; it cannot detect steady host load or every interruption, or prove that GC and runtime effects are absent from the probes. Filtered results describe the retained windows, not unconditional throughput.

Run identical-code controls with separate copies of the same source and matching artifact settings, then repeat the comparison in fresh processes with a fixed run count. Compare raw and filtered estimates and the between-process spread. Do not discard a block because one candidate is slow, retune the filter to obtain a desired speedup, or treat per-block percentile ranges as confidence intervals. Keep measurements inconclusive when the apparent improvement is comparable to control error or depends on filtering.

`bench/process.mjs` uses the same two-variant manifest but loads only one implementation per fresh child process, avoiding mixed facade shapes and overlapping implementation lifetimes within a process. Defaults are three ABBA/BAAB process blocks, 400 warmups, and 30 timed batches per process; process startup and warmup are excluded. Configure block count with `GROVEDOM_BENCH_BLOCKS`, warmups with `GROVEDOM_BENCH_WARMUPS`, and batch counts/sizes with the usual rounds/iterations variables. It checks output equality and preserves every timed batch. A supplementary filtered report rejects complete process blocks only when independent CPU probes vary by more than 1.5×. Run a separate identical-code control using balanced process blocks. This is a complementary check: process-to-process drift and GC still affect results.

The measured default is O3 plus ThinLTO. Native LTO uses lld; both builds resolve matching LLVM archive tools through Clang. `GROVEDOM_LTO=off` retains a straightforward non-LTO build for comparison. No CPU-specific instruction flags or profile-guided training corpus are baked into artifacts. See [the measurements](benchmarks.md#deep-profiling-and-compiler-tuning) for scope and variability.

Wasm feature flags apply to both Lexbor and the kernel, including the LTO link. An empty `GROVEDOM_WASM_FEATURES` keeps compiler defaults; it does not disable features already present in the prebuilt libc. For example, `GROVEDOM_WASM_FEATURES=bulk-memory,simd128` permits explicit bulk operations and automatic vectorization in source compilation. The [feature sweep](benchmarks.md#wasm-target-features-and-removal-of-wasi-imports) found no repeatable overall win, so additional features remain opt-in. There is no runtime feature dispatcher or extra artifact set.

The [repeated short-run feature comparison](benchmarks.md#wasm-features-with-repeated-short-runs) also found no repeatable overall win across Node 22/24 and both authored page sizes. Its raw/filtered estimates, reversed-import runs, and identical-code controls retain substantial variability. These compiler experiments do not measure handwritten SIMD. Generated vector loads/stores alone do not establish acceleration of byte-scanning or parsing loops. Any explicit intrinsics experiment must target a measured bottleneck in GroveDOM-owned code, preserve bounded reads and a scalar path, and remain separate from this feature comparison. Lexbor stays unmodified; no SIMD fork is planned.

The former WASI descriptor imports came from the kernel's mutation-error `snprintf` call, which pulled in libc's general stdio implementation. A bounded integer formatter now writes into the existing document error buffer. The linker discards the unused stdio dependency; no permissive unresolved-symbol policy, syscall wrappers, or suppressed output are needed. Error codes, operation indices, and preceding mutation effects remain intact.

For stack measurements, build into a separate directory with `GROVEDOM_WASM_PROFILE_STACK=1`, then run `node bench/stack.mjs`. This requires the existing `llvm-objdump` executable (`LLVM_OBJDUMP` can override its location). The Node diagnostic verifies disassembly offsets and instruments every stack-pointer assignment in a temporary module, including prebuilt libc code. It also fills the stack with two sentinel patterns before execution. Reports distinguish reserved depth from bytes written; neither includes the engine's separate call stack. Only temporary copies are instrumented, with no Lexbor source changes. Release builds expose no stack globals or counters. An optional `GROVEDOM_HTML_MANIFEST` uses the same private `{ id, path }` input format as heap diagnostics; template-containing pages now run through the facade.

For heap diagnostics, set `GROVEDOM_WASM_PROFILE_GROWTH=1` while building and running. This produces a separate instrumented module. `bench/heap-growth.mjs` reads `GROVEDOM_HTML_MANIFEST`, a private JSON array of `{ "id": "page-label", "path": "input-file" }`. File paths/content are not emitted. `GROVEDOM_HEAP_WORKLOAD=parse` uses a diagnostic-only entry point to parse unmodified pages including templates, then dispose; it does not expose a template DOM or establish facade compatibility. Default mode includes selection, mutation and serialization and reports unsupported pages explicitly. Rebuild for every initial-size setting. Release builds contain no growth-clock instrumentation or template-probe entry point.

A zero live-byte counter after disposal is not proof of prompt OS reclamation, zero arena slack, or absence of fragmentation. Full-workload budgets, sustained mixed-size reuse, the complete engine replay, and the fastest-compatible-baseline audit remain adoption work. Rust remains an unmeasured candidate. No package or repository has been published.
