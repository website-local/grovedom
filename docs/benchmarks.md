# Benchmark targets and adoption gates

## Accepted performance requirements

Adoption requires **at least 3× faster elapsed time for the complete Cheerio DOM workload, including binding overhead**.

```text
speedup = baseline elapsed time / candidate elapsed time
PASS requires speedup >= 3.0
equivalently: candidate time <= baseline time / 3
```

This requirement concerns the DOM workload, not whole-download wall time. Network latency, archive packaging, and disk I/O can dominate a full crawl and are not the primary gate.

The full-workload gate has not been met or tested yet. The [native prototype benchmark](prototype.md#verification-and-diagnostics) measures a runnable authored DOM replay against both Cheerio parsers, including bindings and explicit lifecycle cleanup. It is diagnostic, not the representative engine/MDN adoption replay. Boundary microbenchmarks and upstream parser benchmarks also cannot pass the gate.

GroveDOM must also be faster than Cheerio using **either parse5 or htmlparser2**, comparing the best behaviorally acceptable configuration of each. On the same fixed full-workload replay:

```text
T_current = current Cheerio elapsed time
T_best = min(best compatible Cheerio/parse5 time,
             best compatible Cheerio/htmlparser2 time)
T_grove = GroveDOM elapsed time including glue and lifecycle

PASS requires T_current / T_grove >= 3.0
          and T_best / T_grove > 1.0, with a measured win beyond noise
```

Correctness, memory, simplicity, and migration gates must also pass. The 3× multiplier applies to current Cheerio, not optimized htmlparser2. If a parser configuration cannot preserve required behavior, show the discrepancy and exclusion explicitly rather than weakening the workload to make it comparable.

## Baselines

| Baseline | Purpose |
|---|---|
| Current Cheerio with its actual parse5 configuration | Denominator for the agreed 3× requirement |
| Best compatible Cheerio/parse5 configuration | Ensure a weak default-only baseline does not justify the replacement |
| Cheerio using htmlparser2 / slim, with appropriate options | Best practical JavaScript alternative; mandatory comparison |
| Candidate backend with direct operations | Determine whether command buffering itself helps |
| Same candidate with buffering and bulk APIs | Measure the proposed architecture including facade costs |

An optimized JavaScript baseline can change the value of a replacement substantially. For example, if htmlparser2 halves baseline time, a 3× result against current Cheerio is only 1.5× over that alternative. Measure both ratios on the same corpus.

Report all baseline ratios. If the fastest compatible JS option meets or beats the proposed replacement, the replacement fails the adoption requirement. If current parse5 is already its best compatible configuration, report that fact rather than fabricating a distinct optimized baseline.

## Timed contract

Include all costs required to transform an input document into the required output:

1. Input decoding/encoding/copying and document creation.
2. Parse and tree construction.
3. Actual required queries, traversal, reads, and mutations.
4. Facade calls, command construction, payload encoding, flushes, and binding work.
5. JavaScript callbacks and deterministic URL-hook processing needed by the replay.
6. Serialization and output conversion to the common contract.
7. Document cleanup and sustained allocation/GC behavior.

Use identical input/output contracts. For output destined for saving, account for producing the same UTF-8 bytes, including baseline string-to-buffer conversion when required. Separately measure APIs that must return JS strings. A candidate cannot omit materialization that real hooks require.

Exclude network and file read/write latency from the primary timed region by preloading input and supplying deterministic resource results. Preserve realistic callback issue order. Report one-time module loading, Wasm compilation, shared-instance initialization, and cold selector preparation separately from warm sustained operation; also show cold-start behavior rather than hiding it. Per-document Wasm instantiation/initialization is recurring document creation work and stays inside the primary timed region. Reuse the compiled module for both heap models.

Do not force an artificial GC after every page for one candidate. Use comparable lifecycle boundaries and sufficiently long runs to expose garbage collection and retained native memory. Include live and disposed document phases.

Use explicit `$.dispose()` at the engine-owned boundary in the primary GroveDOM run; include its cost. Run abandoned-document/GC-fallback scenarios separately and report finalizer delay and memory growth without treating prompt collection as guaranteed. Both paths must avoid double release. Compare Node 22 and 24 on the same corpus; Node 18/20 are not adoption targets.

## Corpus and replay

Freeze a manifest with file hashes, byte sizes, page categories/locales, input encodings, expected operations, consumer revisions, options, and expected output invariants. Use fresh trees for each transformation iteration.

Cover:

- Small, medium, and large MDN pages; link-heavy and selector-heavy pages.
- English and Chinese/non-ASCII content.
- Compatibility tables, repeated widgets, tag renaming, inserted table fragments.
- Interactive examples and playgrounds with HTML/CSS/script text.
- `iframe[srcdoc]`, nested documents, clone/wrap/move/replace sequences.
- Malformed HTML, tables, templates, `noscript`, entities, inline SVG/MathML.
- Attribute read/write loops and asynchronous URL-hook order.
- Standalone SVG/XML/sitemap paths once their contract is chosen.

Replay real engine/MDN transformations as well as smaller diagnostic cases. Do not run a full network download to establish a DOM benchmark.

Benchmark generic Node-API calls and direct Wasm exports using the actual final facade. Parser-only C/Rust executables cannot predict JS integration cost. Avoid giving only one backend cached selectors, different scripting settings, reduced semantics, or warmed documents.

All initial timing is single-threaded. Include multiple live documents with interleaved work and hook suspension on that thread; do not use worker pools or multithreaded throughput to establish a DOM speedup. Use Node-based fixture, replay, and reporting scripts; no Python dependency by default.

Correctness tests separately cover callers using independent documents in concurrent Node workers. Supporting those callers does not change the single-thread performance denominator or introduce library-managed threads.

## Correctness gate

Required before accepting performance results:

- Differential tests against the agreed Cheerio behavior and targeted browser/HTML5 expectations.
- Exact comparison for sensitive text, script/style content, URL attributes, and serialization relied upon by consumers.
- Structural comparisons for permitted serialization spelling differences, with each allowed difference documented rather than broadly normalized away.
- Tests for snapshot membership, node identity, aliases, detached nodes, mutation/read ordering, callback observations, and flush failures.
- Document/fragment context, namespace, template, entity, and parser-option checks.
- Existing focused engine/MDN regressions through the adapter.
- C sanitizer coverage for the actual query/mutate/serialize/dispose paths, not only parse-and-destroy fuzz cases.
- Compile representative consumer TypeScript unchanged apart from imports and lifecycle ownership. Check overloads, callback `this`, chained return types, option types, and required raw-node fields against actual runtime behavior; reusing Cheerio declarations must not hide missing APIs.
- Ensure the JS glue/kernel artifacts are paired on the same major.minor version and a tested build. Check installation/load pairing without adding a version/checksum field to command buffers.

A faster output that drops required work or changes observed semantics does not pass. Unsupported APIs, compatibility fallbacks, and resource paths must appear in the report.

## Measurement and proposed aggregation

Use release builds with recorded compiler flags and dependency revisions. Public reports should identify the tested software configuration, target platform, backend options, and batch settings using portable descriptions. Keep exact hardware inventories, host identifiers, filesystem paths, and raw machine diagnostics in ignored local records; do not commit them. Use anonymous environment labels to associate paired trials with those records.

Run paired, alternating trials after warmup on a controlled machine. For each round, measure total time to process the same fixed corpus with the same weights. Report the median paired corpus speedup and dispersion; use enough rounds to distinguish a result from both the 3× current-Cheerio boundary and the 1× best-compatible-Cheerio boundary. Freeze the test environment in private records and publish the corpus, weights, and statistical decision rule before calling an implementation accepted.

The proposed gate applies to the representative aggregate, not every individual tiny page; there is no per-page multiplier. Report category medians, per-page distributions, and p95 so aggregate wins cannot conceal important regressions. Investigate any material regression before adoption.

Required report fields:

- Current-Cheerio, optimized parse5, optimized htmlparser2, and best-compatible ratios.
- Total transform time and phase timings where they can be measured without distorting the primary run.
- Calls, commands, flushes, strings materialized, bytes copied, and batch sizes.
- Allocations/reallocations by phase and size, backing-block growth, scratch reuse, retained selection storage, cache size, and hot-loop allocation sites. Separate diagnostic instrumentation from primary release timing.
- Throughput, median/p95 latency, peak RSS, native/Wasm memory, JS heap, and growth across repeated lifecycles.
- Cold versus warm startup and selector preparation.
- Wasm heap model, live instance count, per-document instantiation cost, linear-memory growth, allocator free holes/internal slack, and capacity retained after large documents and disposal.
- Correctness differences, skipped/fallback work, versions, configuration, corpus fingerprint, and raw samples.

Microbenchmarks for scalar calls, string reads/writes, selection transfer, parsing, querying, mutation, and serialization diagnose bottlenecks. They are not substitutes for the full replay.

## Required memory comparison and gate

For Node-API and all three Wasm models, replay repeated parse/query/mutate/serialize/dispose cycles. Include:

| Case | What it must establish |
|---|---|
| Thousands of bounded document lifecycles | No live allocation leak or rising memory floor after warmup and owner release |
| Several live documents with varied disposal order | Correct ownership and reuse despite interleaved allocation lifetimes |
| One huge page followed by many small pages | Explicit high-water retention and reuse/release behavior, especially for global Wasm memory |
| Alternating short/long attribute and text writes | Superseded value storage is reused/reclaimed; no unbounded string-arena accumulation |
| Repeated queries and many distinct selectors/names | Transient result storage is reclaimable and caches are bounded |
| Retained selections, removed nodes, and output buffers | Stable node identity and output validity, with intentionally retained bytes accounted for |
| Allocation failures, callback exceptions, malformed inputs, disposal twice | Cleanup on all exit paths, safe stale-handle failures, no double-free/use-after-free |
| Drop `$` while keeping a selection/node; later drop all owners | Live selections keep the document alive; fallback cleanup never frees it prematurely |
| Explicit disposal followed by collection; disposal inside a callback | Release-once behavior, no finalizer double-free, safe deferred freeing until the active call unwinds |
| Native arena growth and transferred output Buffers | Balanced external-memory accounting without per-node calls or double-counted output bytes |

The Wasm matrix covers shared/global memory, fresh per-document instances, and a bounded idle pool. All share the compiled module; pooled instances each host one checked-out document. Hold kernel, workload, and semantics constant. Include sequential, interleaved, and nested documents without introducing threads. Track live allocations, allocated capacity, free-block sizes, unusable holes, per-instance page slack, JS references, linear-memory pages, RSS, and disposal/reclamation latency. Show when global memory is reusable but cannot shrink, and when per-document backing memory is awaiting host GC.

Memory acceptance requires no leaked allocations, no avoidable small general-heap allocations per node/command in hot loops, and no accumulating fragmentation that prevents reuse or drives unbounded growth for a bounded workload. Required new nodes and caller-visible strings/arrays are useful allocations; they must be pooled/materialized at the appropriate boundary and counted, not omitted from timing. Use a separate diagnostic run to identify allocation sites.

Set peak/retained-memory budgets from representative document sizes and live-document counts before backend selection; do not invent an unsupported universal byte ceiling now. Document retained detached nodes, bounded cache capacity, and allocator high-water capacity separately from leaks. If those policies exceed the workload budget, revise them before adoption. Native leak/address/undefined-behavior tooling and Wasm allocator/bounds/lifetime checks must cover the real mutation paths; native sanitizer success alone does not verify Wasm lifetimes. GC finalizers cannot be the only document cleanup mechanism.

Test cleanup routines deterministically and run GC-fallback stress separately. A missing finalizer within a fixed timeout is not by itself evidence of a leak; inspect ownership/held-value references and eventual cleanup under sustained collection. For per-document Wasm, verify disposed wrappers and copied output do not retain the instance. For shared Wasm, verify fallback frees document blocks without expecting the linear memory to shrink. Check native cleanup during Node environment teardown without depending on callbacks into JS.

## Simplicity, packaging, and maintenance gates

Before release:

- Install and load tested prebuilt binaries/modules on the declared platform and Node matrix without consumer compiler requirements.
- Set the package floor to Node >=22.0.0. Smoke-check that floor and run full checks on maintained patched Node 22 and 24 releases initially; use stable APIs available at the floor.
- Validate Windows outputs on Windows even if cross-compiled from Linux.
- Audit runtime/import requirements and document unsupported targets.
- Pin the kernel and include relevant reviewed fixes; do not equate latest release with all current fixes included.
- Exercise repeated creation/disposal and retained-handle/output-buffer cases without unbounded growth or use-after-free.
- Keep the production implementation to the chosen backend and a small glue/dispatcher layer. Record compiler/build dependencies and reasons for any extra layer; Python requires an unavoidable dependency, not scripting convenience.
- Ship glue and kernel as a tested pair on the same major.minor version. No stable internal ABI, independent bytecode version, checksum, or negotiation layer is required.
- Demonstrate import-level migration for supported transformations plus cleanup at their document owner, with accurate reused typedefs and explicit unsupported/fallback paths.

These gates supplement the performance requirement. They do not require supporting every platform immediately.

## Present evidence

No complete GroveDOM replay or accepted speedup is published. Call-boundary microbenchmarks and upstream parser results cannot establish a backend winner or pass the full-workload gate. Publish a reproducible harness, permitted corpus references, and reviewed results when those measurements exist; exclude private environment records and downloaded content without redistribution rights.

## Wasm heap and profile diagnostics

The runnable harness now compares Linux Node-API, shared Wasm, fresh per-document Wasm, and pooled Wasm through the same facade. A Node 22 run after API expansion and profiling used 120 authored articles, 15 warmups, and nine rounds of 30 replays. All cases produced identical output. Each row below comes from a separate process; use its own parser baselines rather than comparing absolute times across rows as a controlled backend ranking.

| Candidate | Buffered ms | Current parse5 ms | htmlparser2 ms | Speedup over current / htmlparser2 |
|---|---:|---:|---:|---:|
| Node-API | 1.84 | 7.05 | 4.10 | 3.83× / 2.23× |
| Wasm shared | 2.33 | 6.83 | 4.23 | 2.93× / 1.81× |
| Wasm fresh per DOM | 4.48 | 6.73 | 4.30 | 1.50× / 0.96× |
| Wasm pooled | 2.80 | 7.38 | 4.83 | 2.64× / 1.72× |

Explicit parse5 defaults remain a control, not an optimization claim. Fresh-instance Wasm failed to beat htmlparser2 in this run. Shared and pooled results vary across processes; neither is a selected production winner. These authored results do not establish the complete engine/MDN adoption gate.

### Initial heap sizing

Eight unmodified local MDN HTML inputs, about 3.3–147 KiB, included examples and English/Chinese documentation. A diagnostic-only parsing entry point included template allocations, which the production facade currently rejects. The timed lifecycle included instance acquisition/creation, input conversion, parsing, and disposal. File reads were outside timing. A separate linker wrapper timed libc `sbrk` calls that actually grew linear memory; release builds contain no clock imports or wrapper.

With 2 MiB initial memory, fresh-instance parsing spent approximately **0–7%** of elapsed time growing memory. The larger documents made 8–14 growth calls and reached roughly 2.7–3.1 MiB. Shared and pooled instances made **zero growth calls after warmup** for these bounded page sequences. Fixed 8 MiB and 16 MiB builds removed the growth calls but did not consistently improve complete lifetime time and retained more capacity. Consequently, **no HTML-size heuristic is enabled**. The default stays at 2 MiB; input size alone is also a weak predictor of node/attribute density.

An initial imported-memory experiment was discarded: WASI libc's linker-defined initial allocation region did not expand just because the host supplied more initial pages. The corrected comparison links each initial size into its module. Any future dynamic-sizing implementation must account for this allocator behavior instead of reporting unused pages as usable initial heap.

These observations apply to this small corpus and parsing diagnostic. Repeat on larger pages, denser markup, and real mutation workloads before generalizing. They do not justify custom allocator growth policies or another sizing framework now.

### Retention and profiling

The large-then-small probe grew shared Wasm to about 15.3 MiB; disposal returned live backing allocations to zero but retained that linear memory. Fresh instances reported no owned live memory after disposal, while a burst of 100 small lifecycles produced a transient external-memory sample around 202 MiB before later collection. Pooling reused capacity, respected its four-instance/16 MiB idle caps, and dropped idle references on trim. Host backing-memory reclamation still lagged trim. These are retention observations, not fragmentation proofs.

Node CPU profiles showed substantial selection/wrapper allocation and GC cost. The facade now stores selection state in the target's private field and registers only the public proxy in its WeakMap, removing one WeakMap entry per selection. An alternating A/B probe over 13 rounds of 80 replays measured a median paired speedup of about **1.04× native** and **1.00× pooled Wasm**. The evidence supports a modest native improvement, not a general Wasm speedup. Unobserved edit operations also return no result array, avoiding unnecessary allocation on those paths.

Normal successful workloads drive performance and compatibility decisions. Exact invalid-input behavior/error-message matching is excluded from adoption requirements; bounds, owner validation, cleanup, and successful output behavior remain required.

## Deep profiling and compiler tuning

The next pass used optional C phase instrumentation plus Node CPU sampling. Native x86 timing uses fenced reference-TSC reads calibrated against a monotonic clock. The final empty-scope probe recorded about 14 ns and cost about 42 ns wall time; the Wasm host-clock probe recorded about 318 ns and cost about 677 ns. These figures include instrumentation effects and are environment-specific. Reference ticks are not retired instructions or actual core cycles. Release artifacts contain no profiling clocks, counters, or imports.

On the 120-article replay, the measured facade boundary count fell from **494 to 255 calls**, including combining 239 write/read pairs. The core still executed 485 commands affecting 961 nodes, with 120 attribute reads, 120 text reads, and seven selector compilations. The native backing allocator still received 451 requests, and output generation still made 11,082 callbacks for 33,309 bytes. These counters exclude JS allocations and the small native owner control record. The change reduced transfer/check overhead without omitting DOM work or increasing backing allocation requests.

The retained changes are short ASCII command encoding without per-operand encoder views/results, private node metadata instead of per-node WeakMap entries, combined pending writes and following reads, and reusable Wasm import callbacks. Callback node identities remain snapshots; live getters observe preceding writes. The focused regressions cover nested callbacks, aliasing, current-value callbacks, unsafe buffers, disposed owners, and partial command failure.

### Compiler choice

Clang/LLVM 19 comparisons held JS and core behavior constant. Native tested O2/off, O3/off, O3/ThinLTO, and O3/full LTO; Wasm tested O3 with each LTO mode. Lexbor remained O3. Eleven alternating rounds used 60 replays at 120 articles and 30 at 600 articles, after 80 warmups per variant.

ThinLTO initially improved native by about 11% at 120 articles; the 600-article result was near parity. A two-variant repeat over 17 rounds measured about 4% and 3% improvements respectively. Pooled Wasm improved about 9% and 10% with ThinLTO. Full LTO showed no clear small-workload advantage, although one larger Wasm run improved about 15%. The selected default is **O3/ThinLTO**, with explicit off/full options retained for experiments. This is a workload-dependent choice, not a universal optimum.

The native artifact decreased from approximately 1.43 MiB to 1.22 MiB; Wasm increased from approximately 726 KiB to 814 KiB. Build concurrency is bounded, matching archive tools are resolved through Clang, and no architecture-specific instruction flags are enabled.

### Direct before/after release comparison

These results compare the complete pre-pass implementation with the final implementation directly, rather than multiplying individual optimization estimates. Each pair uses isolated source/artifact snapshots, exact output comparison, 80 warmups, and 11 alternating rounds. Figures are medians of paired per-round ratios; timing columns are independently calculated medians.

| Backend / authored articles | Before ms | After ms | Paired speedup |
|---|---:|---:|---:|
| Node-API / 120 | 1.790 | 1.432 | 1.22× |
| Wasm shared / 120 | 2.236 | 1.899 | 1.18× |
| Wasm fresh / 120 | 3.798 | 3.284 | 1.14× |
| Wasm pooled / 120 | 2.248 | 1.851 | 1.23× |
| Node-API / 600 | 9.971 | 7.684 | 1.27× |
| Wasm pooled / 600 | 11.098 | 9.193 | 1.22× |

Node 24 repeats at 120 articles measured about 1.22× native and 1.16× pooled Wasm. Four unmodified MDN example documents, about 3.3–28 KiB, also passed exact before/after output comparison through this diagnostic replay. Pooled Wasm improved about 7–14%. Native was mixed: a longer 17-round, 500-replay check ranged from about 4% slower to 12% faster. No universal native improvement is claimed for tiny documents. These examples do not execute the engine's actual transformations; larger template-containing MDN pages remain unsupported by the production facade.

The final Node 22 comparison with Cheerio 1.2.0 used the existing nine-round, 30-replay authored harness. Each backend has its own process and parser baselines; absolute row times are not a controlled backend ranking.

| Candidate | Buffered ms | Current parse5 ms | htmlparser2 ms | Current / htmlparser2 speedup |
|---|---:|---:|---:|---:|
| Node-API | 1.546 | 6.048 | 3.831 | 3.91× / 2.48× |
| Wasm shared | 1.905 | 6.498 | 4.473 | 3.41× / 2.35× |
| Wasm fresh per DOM | 4.661 | 8.177 | 7.137 | 1.75× / 1.53× |
| Wasm pooled | 1.943 | 6.750 | 4.145 | 3.47× / 2.13× |

All rows matched exact output, including the explicit-parse5-default control. Fresh-Wasm process timings varied substantially from the earlier run, including its Cheerio baselines; neither run establishes a general win for fresh instances.

The 455-case matrix passes on native/shared/fresh Wasm (443 passes, 12 skips) and pooled Wasm (446 passes, nine upstream exclusions). Native and pooled Wasm pass on Node 22 and 24. Native ASan/UBSan with leak detection reports no findings. Repeated lifetime tests return tracked live backing bytes to zero; the pool remains bounded and releases idle references on trim. Shared linear memory still retains its high-water capacity. This does not prove absence of fragmentation, and the full engine replay, memory budgets, and adoption gate remain open.

## Wasm target features and removal of WASI imports

The next experiment held O3/ThinLTO, the prebuilt libc, initial memory, pooled ownership, and JS behavior constant. Target features were applied to both Lexbor and the kernel, including the LTO link. The compiler's default feature set already appeared alongside bulk-memory, multivalue, and reference-types annotations from libc; those annotations alone did not enable the corresponding optimizations in GroveDOM's source compilation.

All tested feature combinations loaded on the patched Node 22 and 24 runtimes without experimental runtime flags. Disassembly of the import-free builds confirmed actual code generation: explicit bulk memory raised the static `memory.copy`/`memory.fill` count from 3 to 678; SIMD enabled 352 vector instructions. The extended set added 12 tail calls and four nontrapping conversions, but emitted **zero relaxed-SIMD instructions**. More enabled features do not imply more useful instructions.

The following paired speedups use the import-free default-feature build as the denominator. Each variant had 80 warmups and 17 alternating rounds: 80 replays at 120 articles, 40 at 600. Output matched exactly before timing.

| Additional features | Node 22 / 120 | Node 22 / 600 | Node 24 / 120 | Node 24 / 600 |
|---|---:|---:|---:|---:|
| Bulk memory | 1.006× | 1.032× | 0.989× | 1.034× |
| SIMD128 | 0.989× | 1.045× | 1.015× | 1.014× |
| Bulk memory + SIMD128 | 0.995× | 0.998× | 1.011× | 1.041× |
| Above + relaxed SIMD + tail calls + nontrapping conversions | 1.014× | 1.016× | 0.984× | 0.990× |

A dedicated two-variant bulk-memory repeat reversed the apparent gain: **0.959× at 120 articles and 0.972× at 600** on Node 22. Four compatible MDN examples ranged from about 0.99× to 1.16× with bulk memory; the largest example benefited most. The overall evidence is mixed, so **no additional target features are enabled by default**. `GROVEDOM_WASM_FEATURES` retains explicit opt-in experiments without runtime dispatch, feature detection, or extra shipped variants. Atomics, shared memory, and memory64 are outside this experiment.

### Why stdio was linked

The linker's archive-extraction trace identified one kernel call: mutation-error `snprintf` pulled in `vsnprintf`, `vfprintf`, stderr support, and ultimately `fd_close`, `fd_seek`, and `fd_write` imports. This establishes a dependency chain, not evidence that ordinary DOM operations performed I/O or proof of a libc defect.

The kernel now formats the operation index into its existing fixed-size error buffer, with a compile-time capacity check. Linker section garbage collection discards the unused stdio code. The JS descriptor stubs are removed. Release builds verify **zero imports**; diagnostic builds allow only their explicit clock/counter imports. Unresolved symbols and unexpected imports are not silently ignored.

The default release module shrank from **833,010 to 764,031 bytes (8.3%)** and instantiates without an imports object. A paired before/after check on Node 22 measured about 1.03× for shared and pooled Wasm at 120 articles, 1.01× for fresh instances, and 1.02× for pooled Wasm at 600 articles. Node 24 pooled timing was near parity. Tiny MDN examples remained variable. These modest timings are diagnostic; the clear changes are the smaller artifact and removal of the host-I/O dependency.

The final 456-case matrix passes: native/shared/fresh Wasm have 444 passes and 12 skips; pooled Wasm has 447 passes and nine upstream exclusions. Native and pooled Wasm pass on Node 22 and 24. Native ASan/UBSan with leak detection emits no findings. The added regression covers zero- and multi-digit error indices and preserved partial effects; experimental feature builds also pass it. A combined phase/growth diagnostic build imports only its three `env` timing functions and leaves tracked live bytes at zero after cleanup. The complete engine performance and memory gates remain open.

## Selector storage and Wasm transfer allocations

The next profile-guided pass replaces separate per-selector arenas with one document-owned CSS arena for up to 32 cached plans and their keys. It reuses the CSS parser's selector state. A cache miss at capacity or a failed parse clears the complete cache/arena. Queries are synchronous and selections contain node IDs, so no external selection depends on the lifetime of a parsed selector.

The Wasm adapter reuses whole-memory byte/word views for transfers and result descriptors, refreshes them after heap growth, and clears them on disposal. Returned arrays and strings still own their data. Short ASCII names avoid temporary encoder views/results, and typed-array validation uses fixed types while retaining ordinary-buffer checks. A separate proxy-index experiment was reverted after mixed results.

**Elapsed-time samples from this pass were collected under high host load and are provisional. They do not establish a further speedup.** Repeat paired release measurements on a quiet host before drawing throughput conclusions or changing backend/compiler defaults. The retained changes have a directly measurable allocation benefit; their complete-workload timing effect remains open.

One authored 120-article replay in a fresh process, including disposal, produced these backing-allocator counters compared with the preceding import-free checkpoint:

| Backend | Allocation requests before | After | Peak tracked bytes before | After |
|---|---:|---:|---:|---:|
| Node-API | 451 | 264 | 2,500,596 | 1,827,248 |
| Wasm shared | 439 | 252 | 1,458,756 | 1,020,876 |

Requests decreased about **41–43%**, and peak tracked bytes about **27–30%**. Pooled Wasm also used 439 versus 252 allocation requests. Its retained linear memory after that single replay decreased from 44 to 37 pages (2.75 to 2.3125 MiB); both builds retain the same 32-page initial setting. Live documents and tracked live bytes returned to zero. These counters exclude JS allocations, the small owner control record, and allocator slack; they are not evidence of zero fragmentation or immediate OS reclamation.

Reproduce current counters with `node bench/allocations.mjs`, or `GROVEDOM_BACKEND=wasm GROVEDOM_WASM_HEAP=global node bench/allocations.mjs`. Use a fresh process for each source/artifact pair. The shared-heap counter records the actual core high-water mark; fresh/pooled statistics sample live bytes only and cannot measure a completed lifecycle's peak from a single final sample.

Exact before/after outputs matched for the authored replay and four unmodified compatible MDN examples. The 459-case matrix passes on Node 22: native 445 passes/14 skips, shared Wasm 446/13, fresh Wasm 447/12, and pooled Wasm 450/9. Native and pooled Wasm also pass on Node 24; ASan/UBSan with leak detection reports no findings. Added regressions cover cache resets, repeated invalid queries, preserved snapshots, Unicode transfers after heap growth, and collection of released heap buffers while disposed selections remain reachable. Release Wasm still has zero imports. The full engine replay and fastest-compatible-Cheerio adoption gates remain unverified.
