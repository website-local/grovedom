# Benchmark targets and adoption gates

The [Wasm-first investigation](#wasm-first-investigation-after-2eef7b6) records the
latest direct native/Wasm/Cheerio comparison and the experiments retained or
rejected in this pass.

## Accepted performance requirements

The current investigation prioritizes pooled Wasm, with best-effort milestones of
6× current Cheerio on native mixed synthetic work and 4.5× on the pooled-Wasm
19-scenario consumer panel. These are milestones, not stopping conditions. The
pass also examines selector algorithms, linked libc calls, compiler/post-link
optimization, allocations, retention and seeded fuzz failures. The established
HTML/XML behavior and regression gates remain in force. Optimization candidates
must earn their additional code and memory through paired measurements.

Adoption requires **at least 3× faster elapsed time for the complete Cheerio DOM workload, including binding overhead**.

```text
speedup = baseline elapsed time / candidate elapsed time
PASS requires speedup >= 3.0
equivalently: candidate time <= baseline time / 3
```

This requirement concerns the DOM workload, not whole-download wall time. Network latency, archive packaging, and disk I/O can dominate a full crawl and are not the primary gate.

The [fixed whole-corpus panels](#whole-corpus-optimization-gate-after-3fd1609) now meet the numerical target on Node 22 for native and pooled Wasm. They include actual engine/MDN transforms, bindings and explicit lifecycle cleanup, with a documented scope and decision rule. Production adoption remains open. The smaller authored benchmark, boundary microbenchmarks and upstream parser benchmarks alone cannot pass the full-workload gate.

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
- Standalone SVG/XML/sitemap paths, including case-sensitive selectors and output.

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

With 2 MiB initial memory, fresh-instance parsing spent approximately **0–7%** of elapsed time growing memory. The larger documents made 8–14 growth calls and reached roughly 2.7–3.1 MiB. Shared and pooled instances made **zero growth calls after warmup** for these bounded page sequences. Fixed 8 MiB and 16 MiB builds removed the growth calls but did not consistently improve complete lifetime time and retained more capacity. Consequently, **no HTML-size heuristic is enabled**. This pass retained the then-default 2 MiB; a later [stack measurement](#wasm-stack-and-transfer-storage) reduces the fixed reservation. Input size alone is also a weak predictor of node/attribute density.

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

The following paired speedups are default-feature elapsed time divided by feature-enabled elapsed time, using import-free builds. Each variant had 80 warmups and 17 alternating rounds: 80 replays at 120 articles, 40 at 600. Output matched exactly before timing.

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

**The initial elapsed-time samples from this pass were collected under high host load and do not establish a further speedup.** The follow-up below uses repeated short blocks with a fixed control-based filter. The original samples remain excluded from throughput conclusions. The retained changes have a directly measurable allocation benefit; their complete-workload timing effect remains open.

One authored 120-article replay in a fresh process, including disposal, produced these backing-allocator counters compared with the preceding import-free checkpoint:

| Backend | Allocation requests before | After | Peak tracked bytes before | After |
|---|---:|---:|---:|---:|
| Node-API | 451 | 264 | 2,500,596 | 1,827,248 |
| Wasm shared | 439 | 252 | 1,458,756 | 1,020,876 |

Requests decreased about **41–43%**, and peak tracked bytes about **27–30%**. Pooled Wasm also used 439 versus 252 allocation requests. Its retained linear memory after that single replay decreased from 44 to 37 pages (2.75 to 2.3125 MiB); both builds retain the same 32-page initial setting. Live documents and tracked live bytes returned to zero. These counters exclude JS allocations, the small owner control record, and allocator slack; they are not evidence of zero fragmentation or immediate OS reclamation.

Reproduce current counters with `node bench/allocations.mjs`, or `GROVEDOM_BACKEND=wasm GROVEDOM_WASM_HEAP=global node bench/allocations.mjs`. Use a fresh process for each source/artifact pair. The shared-heap counter records the actual core high-water mark; fresh/pooled statistics sample live bytes only and cannot measure a completed lifecycle's peak from a single final sample.

Exact before/after outputs matched for the authored replay and four unmodified compatible MDN examples. The 459-case matrix passes on Node 22: native 445 passes/14 skips, shared Wasm 446/13, fresh Wasm 447/12, and pooled Wasm 450/9. Native and pooled Wasm also pass on Node 24; ASan/UBSan with leak detection reports no findings. Added regressions cover cache resets, repeated invalid queries, preserved snapshots, Unicode transfers after heap growth, and collection of released heap buffers while disposed selections remain reachable. Release Wasm still has zero imports. The full engine replay and fastest-compatible-Cheerio adoption gates remain unverified.

## Repeated short runs under variable load

`bench/short.mjs` compares the preceding import-free checkpoint with the allocation changes using short timed batches. Each block contains both ABBA and BAAB halves; each variant gets the first position after an event-loop yield. This matters because identical-code controls showed a first-batch penalty that a single ABBA half did not cancel. A separate integer-loop probe surrounds each batch. The fixed filter rejects the entire balanced block only if maximum/minimum probe time exceeds 1.5. Candidate times, ratios, and GC events are never used to choose retained samples. All raw data and both summaries remain available.

The reported experiment used 40 fresh Node processes: three comparisons, one identical-code control, and one reversed-import comparison for each case below. Each process used 200 warmups per variant and 60 balanced blocks. Batches contained 12 replays at 120 articles or three at 600, including parsing, queries, mutations, serialization, and disposal. Output matched exactly before timing. Filter rules were finalized using controls before the reported candidate measurements; no runs were discarded because of their speedup result.

The filter retained **2,355 of 2,400 blocks**, including **1,414 of 1,440** blocks in the three main comparisons. It changed their median speedup estimates by less than 0.5 percentage points. The table reports medians of the three process estimates and their range, not confidence intervals. All speedups are preceding-implementation elapsed time divided by updated-implementation elapsed time. The reversed-import check is normalized to the same direction and reported separately.

| Runtime / backend / articles | Raw median | Filtered median | Three filtered estimates, min–max | Identical-code control | Reversed-import check |
|---|---:|---:|---:|---:|---:|
| Node 22 / Node-API / 120 | 1.028× | 1.030× | 1.006–1.030× | 0.974× | 1.039× |
| Node 22 / Node-API / 600 | 1.026× | 1.021× | 1.008–1.032× | 0.995× | 1.031× |
| Node 22 / Wasm pooled / 120 | 1.032× | 1.032× | 1.029–1.038× | 0.998× | 1.091× |
| Node 22 / Wasm pooled / 600 | 1.045× | 1.044× | 0.976–1.071× | 1.022× | 1.055× |
| Node 24 / Node-API / 120 | 1.015× | 1.014× | 0.998–1.015× | 0.974× | 1.100× |
| Node 24 / Node-API / 600 | 0.998× | 1.000× | 0.980–1.033× | 1.012× | 1.023× |
| Node 24 / Wasm pooled / 120 | 1.008× | 1.008× | 0.966–1.048× | 1.018× | 1.011× |
| Node 24 / Wasm pooled / 600 | 1.036× | 1.038× | 1.012–1.040× | 0.995× | 1.078× |

The strongest repeatable directions are modest gains for Node 22 native at 600 articles, Node 22 pooled Wasm at 120, and Node 24 pooled Wasm at 600. Several other cases span parity or a regression, and identical-code controls retain offsets as large as about 2.6%. Reversing import order in an additional process also changes some estimates substantially. That check runs at a different time, so it cannot separate loading order from host/runtime variability. Do not generalize the larger individual estimates or claim a precise universal speedup.

Short repetitions and filtering permit useful progress under variable load, but filtering does not remove steady interference, every interruption, or runtime effects. The allocation reductions remain stronger evidence than a blanket throughput claim. Backend/compiler defaults and the unverified complete-engine adoption gates are unchanged.

## Wasm features with repeated short runs

**Additional Wasm target features remain opt-in.** A fresh comparison on the allocation-optimized source at `6f3c36f` found no repeatable overall win. This is a new comparison against matching default-feature artifacts, not a timing comparison with the older source used in the first feature sweep.

The experiment held JS source, kernel source, prebuilt libc, O3/ThinLTO, 32 initial memory pages, and pooled ownership constant. It used Node 22.22.2 and 24.18.0, with 120 and 600 authored articles. For each runtime/size, every feature received three fresh-process comparisons plus one shared identical-code control: **52 processes total**. Each process used 200 warmups per variant and 60 balanced blocks, with 12 replays per batch at 120 articles and three at 600. Output matched exactly before timing. The second comparison reversed import order; feature and size run order also varied between passes according to a fixed schedule.

The existing probe-only filter retained **3,042 of 3,120 blocks**, including **2,808 of 2,880** feature-comparison blocks. No run was discarded based on its result, and no filter or candidate changes were made during measurement. Filtering changed individual process speedup estimates by at most 0.56 percentage points. All raw blocks, rejected blocks, and both summaries were retained locally.

Every ratio below is **default elapsed / feature elapsed**; above one means faster. Reversed-import ratios are normalized from the raw block timings before aggregation. Medians and ranges describe the three process estimates, not confidence intervals. The reversed column shows the second estimate, which is also included in the median and range. `bulk` means bulk-memory, `simd` means SIMD128, and `extended` adds relaxed SIMD, tail calls, and nontrapping conversions to bulk-memory + SIMD128.

| Node / articles | Features | Raw median | Filtered median | Filtered min–max | Reversed imports | Retained blocks |
|---|---|---:|---:|---:|---:|---:|
| 22 / 120 | bulk | 0.988× | 0.988× | 0.975–1.023× | 1.023× | 177/180 |
| 22 / 120 | simd | 0.994× | 0.994× | 0.978–1.017× | 0.994× | 177/180 |
| 22 / 120 | bulk-simd | 0.992× | 0.990× | 0.985–0.993× | 0.993× | 177/180 |
| 22 / 120 | extended | 0.988× | 0.988× | 0.987–1.000× | 0.987× | 175/180 |
| 22 / 600 | bulk | 0.989× | 0.988× | 0.986–0.994× | 0.988× | 177/180 |
| 22 / 600 | simd | 1.000× | 0.995× | 0.993–1.011× | 1.011× | 173/180 |
| 22 / 600 | bulk-simd | 1.003× | 1.003× | 0.976–1.009× | 0.976× | 176/180 |
| 22 / 600 | extended | 1.008× | 1.011× | 0.986–1.012× | 1.011× | 176/180 |
| 24 / 120 | bulk | 1.016× | 1.016× | 0.956–1.064× | 1.064× | 177/180 |
| 24 / 120 | simd | 0.994× | 0.995× | 0.942–1.018× | 1.018× | 176/180 |
| 24 / 120 | bulk-simd | 0.973× | 0.973× | 0.956–0.995× | 0.995× | 177/180 |
| 24 / 120 | extended | 1.000× | 1.002× | 0.988–1.012× | 1.012× | 175/180 |
| 24 / 600 | bulk | 0.975× | 0.975× | 0.965–0.986× | 0.965× | 174/180 |
| 24 / 600 | simd | 0.998× | 1.001× | 0.976–1.017× | 1.001× | 175/180 |
| 24 / 600 | bulk-simd | 0.968× | 0.968× | 0.961–0.974× | 0.974× | 173/180 |
| 24 / 600 | extended | 0.953× | 0.951× | 0.950–0.960× | 0.950× | 173/180 |

Identical-code controls show why small apparent gains remain inconclusive:

| Node / articles | Raw control | Filtered control | Retained blocks |
|---|---:|---:|---:|
| 22 / 120 | 0.986× | 0.986× | 59/60 |
| 22 / 600 | 0.995× | 0.994× | 59/60 |
| 24 / 120 | 0.963× | 0.964× | 59/60 |
| 24 / 600 | 0.997× | 0.996× | 57/60 |

The Node 24 small-page control is particularly order-sensitive: retained blocks starting ABBA versus BAAB have median ratios of **1.000× versus 0.831×**, although every block contains both halves. Its overall 3.6% offset is therefore not a bound on measurement error. Probe stability does not establish absence of runtime or ordering effects. The larger Node 24 case consistently regresses for bulk, bulk-simd, and extended in these runs, while SIMD alone spans parity on every runtime/size. Neither isolated gains nor these conditional regressions establish a universal feature ranking.

### What the compiler-generated SIMD contains

Disassembly of the current artifacts confirms different instructions, but does not count their executions:

| Additional features | Module bytes | Static memory.copy/fill | SIMD instructions | Tail calls | Relaxed SIMD | Nontrapping conversions |
|---|---:|---:|---:|---:|---:|---:|
| None | 764,755 | 3 | 0 | 0 | 0 | 0 |
| bulk | 759,588 | 678 | 0 | 0 | 0 | 0 |
| simd | 764,585 | 3 | 362 | 0 | 0 | 0 |
| bulk-simd | 759,398 | 678 | 362 | 0 | 0 | 0 |
| extended | 759,307 | 678 | 362 | 11 | 0 | 4 |

The SIMD-only build's 362 vector instructions consist of **113 constants, 232 stores, 16 loads, and one byte shuffle**. It contains no vector byte comparisons. Enabling SIMD has generated mostly memory movement/initialization, not evidence of vectorized byte scanning. This comparison does not measure handwritten intrinsics, and its inconclusive SIMD timings do not rule out a targeted implementation. Any such experiment must stay in GroveDOM-owned code, preserve a scalar path and bounded memory access, and show a benefit including boundary/lifecycle costs. Lexbor remains unmodified; no SIMD fork is planned.

All five builds retain **zero imports** and pass the pooled-Wasm suite on both runtimes: **459 cases, 450 passes and nine documented skips** per build/runtime. No runtime implementation or default flags changed in this repeat. The full engine replay, fastest-compatible-Cheerio comparison, and memory/adoption gates remain open.

## Wasm stack and transfer storage

The next pass reduces memory reservation and transfer overhead while preserving document-local queues. The selected defaults are **1 MiB initial linear memory, a 64 KiB stack, and 16 KiB fixed transfer scratch per instance**. The former defaults were 2 MiB initial memory and a 1 MiB stack. O3/ThinLTO and the default target feature set are unchanged; Lexbor remains unmodified.

### Stack measurements

`bench/stack.mjs` combines written-byte watermarks with instrumentation of every compiled stack-pointer assignment. The Node utility uses existing LLVM disassembly, verifies offsets against module bytes, updates a temporary module, and validates it before execution. The measured artifact has 100 stack-pointer write sites, including prebuilt libc. A separate compiled probe with known, unwritten reservations from 16 through 32,000 bytes verified the counter; a watermark alone would miss those reservations. Release artifacts contain none of this instrumentation or the diagnostic stack exports.

| Workload | Maximum stack-pointer depth | Maximum written depth |
|---|---:|---:|
| Authored replay, 120 / 600 / 5,000 articles | 80 bytes | 52 bytes |
| Trees nested 100 / 1,000 / 10,000 elements | 64 bytes | 52 bytes |
| Selectors with 20 / 100 / 500 nested `:is()` calls | 64 bytes | 52 bytes |
| Eight selected unmodified MDN pages | 96 bytes | 68 bytes |

Both sentinel patterns agreed, and every case restored the stack pointer. Four MDN pages completed the facade replay; four template-containing pages were parsed and then explicitly rejected by the facade. Their measurements cover that path, not supported template transformations. These are linear-memory stack measurements: Wasm locals and the engine's separate call stack are not included. They do not prove a worst-case bound for arbitrary future kernel paths. The 64 KiB reservation provides substantial measured headroom and passes the suite; repeat the diagnostic when extending parser/selector paths or changing compilation.

### Fixed scratch and string results

Small synchronous transfers now reuse a 16 KiB area in each Wasm instance. One authored replay eliminates **492 `gk_transfer` calls**, with one new scratch-address lookup at instance creation. Actual backing-allocation requests decrease only **252 → 250**, because the previous transfer buffers already reused their allocations. The fixed area is additional static capacity, not free storage. Oversized opcode/payload/ID transfers retain the document-owned growable fallback. Tests cover the exact boundary, overflow, interleaved owners, memory growth, and copied results.

Pending JS mutation queues remain per-document. A single shared pending queue would need copying or early flushing when another document runs, changing lifecycle/error timing. The shared scratch contains only the synchronous call's transfers; no queued operation or public result borrows it after return.

String results decode directly from a cached Node `Buffer` view, avoiding **241 temporary result subarrays** in this authored replay. The returned strings still own their bytes, views refresh after growth, and disposal clears references. This also preserves leading BOM characters previously stripped by the default `TextDecoder`. Unicode, NUL, BOM, and post-disposal results have regression coverage.

| Linear-memory observation | Before | Final |
|---|---:|---:|
| Initial instance | 2 MiB | 1 MiB |
| Pooled instance after one 120-article replay | 2.3125 MiB | 1.375 MiB |
| Fresh instances, eight simultaneous 80-article DOMs | 17 MiB | 9.5 MiB |
| Idle pool after the mixed-lifetime probe | 8.5 MiB | 4.75 MiB |
| Shared heap after the large-then-small probe | 15.25 MiB | 14.375 MiB |

The 120-article core peak counter changes only from 1,020,876 to 1,018,796 bytes; most linear-memory savings come from the smaller stack reservation. All tracked live backing bytes return to zero. Pool trim releases idle references, while shared memory retains its high-water capacity. These observations do not establish fragmentation budgets or immediate OS reclamation.

### Release timing and limits

The baseline is `9187556`; timing in this pass uses pooled Wasm unless explicitly labeled Node-API. Two sequential short-run passes each used 16 fresh processes: three comparisons and one identical-code control for each runtime/size. Each comparison process used the established 60 balanced blocks, 200 warmups, and 12 replays per batch at 120 articles or three at 600. The second comparison reversed import order, and its ratios are normalized before aggregation. All results, including regressions, remain included. The final pass retained **938 of 960 blocks**; both passes retained 1,867 of 1,920. No filtering rule changed.

Every speedup is baseline elapsed / candidate elapsed. The first candidate has fixed scratch and smaller stack/initial memory; the final candidate also decodes strings from its cached memory view. Ranges are the three process estimates, not confidence intervals.

| Candidate / Node / articles | Raw median | Filtered median | Filtered min–max | Identical-code control |
|---|---:|---:|---:|---:|
| Scratch + smaller memory / 22 / 120 | 1.020× | 1.019× | 1.013–1.039× | 0.978× |
| Scratch + smaller memory / 22 / 600 | 1.000× | 0.999× | 0.990–1.001× | 0.992× |
| Scratch + smaller memory / 24 / 120 | 0.922× | 0.932× | 0.923–1.028× | 0.937× |
| Scratch + smaller memory / 24 / 600 | 0.996× | 0.991× | 0.973–1.037× | 1.003× |
| Final / 22 / 120 | 1.011× | 1.012× | 0.996–1.019× | 0.996× |
| Final / 22 / 600 | 1.031× | 1.033× | 1.005–1.044× | 0.993× |
| Final / 24 / 120 | 0.958× | 0.960× | 0.957–1.000× | 1.036× |
| Final / 24 / 600 | 1.027× | 1.033× | 1.003–1.034× | 1.048× |

Because controls and small-page results remain order-sensitive, a complementary check loads just one implementation per child process. It uses 400 warmups, 30 short batches, and three ABBA/BAAB process blocks, plus one identical-code block per runtime/size: **64 child processes**. No batch is filtered. Each process contributes its median batch time, paired by process block. This avoids mixing facade shapes and implementation lifetimes inside one process; it still includes GC and between-process drift. `bench/process.mjs` exposes this method with the same variant/corpus manifest.

| Node / articles | Median speedup | Three process-block estimates, min–max | Identical-code control |
|---|---:|---:|---:|
| 22 / 120 | 1.018× | 1.010–1.027× | 0.993× |
| 22 / 600 | 1.047× | 1.032–1.064× | 1.008× |
| 24 / 120 | 1.003× | 0.997–1.009× | 1.000× |
| 24 / 600 | 1.038× | 0.957–1.040× | 1.045× |

The strongest timing evidence is a modest improvement in the larger Node 22 replay. Node 24 results remain inconclusive: small pages move toward parity with process isolation, and the larger case has a regression in one block plus a 4.5% control offset. Neither method supports a universal speedup claim. The definite changes are lower linear-memory reservation and fewer transfer calls/temporary views.

Four compatible MDN examples also matched exact output. Their original two-variant check used nine alternating rounds of 80 replays. A separate-process follow-up used the same 400-warmup/30-batch method and three process blocks, with one identical-code block per page. These short page workloads remain inconclusive; controls alone range from 0.872× to 1.102×.

| MDN example | Original paired estimate | Separate-process median | Separate-process min–max | Identical-code control |
|---|---:|---:|---:|---:|
| 1 | 1.115× | 0.987× | 0.777–1.070× | 0.872× |
| 2 | 0.936× | 1.000× | 0.946–1.052× | 1.102× |
| 3 | 0.885× | 1.006× | 0.985–1.021× | 0.992× |
| 4 | 1.030× | 0.975× | 0.956–1.015× | 1.097× |

The final authored 120-article comparison with Cheerio 1.2.0 used nine rounds and 30 replays on Node 22. Each backend runs with its own parser baselines, so absolute times are not a controlled backend ranking. All outputs matched, including explicit parse5 defaults. These diagnostics continue to beat both parser baselines; they do not establish the full engine adoption gate.

| Candidate | Buffered ms | Current parse5 ms | Explicit-default parse5 ms | htmlparser2 ms | Current / htmlparser2 speedup |
|---|---:|---:|---:|---:|---:|
| Node-API | 1.304 | 5.503 | 5.417 | 3.615 | 4.22× / 2.77× |
| Wasm pooled | 1.647 | 5.639 | 5.464 | 3.655 | 3.42× / 2.22× |

The 462-case matrix passes on Node 22: native 447 passes/15 skips, shared Wasm 449/13, fresh Wasm 450/12, and pooled Wasm 453/9. Native and pooled Wasm also pass on Node 24. Type checks and native ASan/UBSan with leak detection pass; no sanitizer reports were emitted. Release Wasm remains import-free and has no diagnostic stack exports. The final CPU profile still shows transfer handling, selection creation, parsing, queries, and allocation work; template support and the real engine adapter should expose the next representative workloads before further broad optimization claims.

## Cheerio feature expansion and XML diagnostics

This pass expands the selection-method suites, adds templates and relative queries, and fixes retained attribute storage during subtree recycling. All eight selected unmodified MDN pages match Cheerio/parse5 on parsing and the authored replay, including four newly enabled template pages of roughly 94–150 KB. This remains an authored operation sequence, not the engine's complete transformation pipeline. htmlparser2 produces different bytes on those four pages; their semantic acceptability has not been audited, so byte differences alone do not disqualify that baseline.

Before XML was added, three alternating process blocks measured baseline/candidate ratios of 0.996 and 1.018 for native at 120/600 articles, with identical-code controls of 0.977 and 1.010. Pooled Wasm measured 0.967 and 0.999, with controls of 0.904 and 0.997. Longer pooled 120-article process repeats were inconsistent across Node 22/24. Three Node 22 short-run repeats measured 0.984, 0.996 and 0.984, against an identical-code control of 0.994; Node 24 repeats ranged from 0.945 to 1.136. These results do not establish strict absence of a small regression.

The expanded HTML diagnostic at 120 articles measured:

| Backend | GroveDOM (ms) | Current Cheerio (ms) | Explicit parse5 defaults (ms) | htmlparser2 (ms) | Speedup vs current / htmlparser2 |
|---|---:|---:|---:|---:|---:|
| Native buffered | 1.394 | 5.852 | 5.581 | 3.903 | 4.20× / 2.80× |
| Wasm pooled | 1.790 | 6.243 | 5.817 | 3.806 | 3.49× / 2.13× |

Each backend used a separate process, nine rounds and 30 replays per batch on Node 22. These rows are not a controlled native-versus-Wasm ranking. One ABBA process block on each newly enabled MDN page, with 100 warmups and 15 batches of six replays, measured 4.18–4.97× native and 3.39–4.43× pooled Wasm versus parse5. They establish runnable paths and diagnostic speed, not the full-workload adoption gate.

XML adds a shared iterative tokenizer, XML serializer and cached case-sensitive selector-name mapping. No additional dependency, compiler or host import is introduced. Cheerio `{ xml: true }` uses htmlparser2; parse5 cannot provide an XML baseline. The authored `bench/xml-fixtures.mjs` workloads include load, selectors, attribute/text callbacks, mutations, serialization and explicit disposal. Exact output is checked before timing.

Initial Node 22 short-run results used 200 warmups per variant, 24 balanced ABBA/BAAB blocks and six replays per batch. The unchanged CPU-probe filter rejects a whole block only for max/min probe spread above 1.5. All raw blocks remain in local evidence; candidate times and ratios do not determine retention.

| XML workload | Backend | Raw speedup | Filtered speedup | Retained blocks |
|---|---|---:|---:|---:|
| Sitemap, 600 entries | Native | 2.426× | 2.386× | 23/24 |
| SVG, 300 groups | Native | 1.395× | 1.414× | 22/24 |
| Sitemap, 600 entries | Wasm pooled | 2.071× | 2.071× | 23/24 |
| SVG, 300 groups | Wasm pooled | 1.315× | 1.315× | 24/24 |

These initial XML measurements favor the candidate, but do not meet 3× in isolation or establish full-engine performance. The adoption target remains the complete required DOM workload. Host interference, GC, starting order and compilation behavior limit precision; no universal backend ranking follows from these results.

The expanded stack diagnostic covers all eight MDN pages, deep HTML/templates and XML with declarations, attributes, CDATA, cloning and root selectors at depths 100, 1,000 and 5,000. Across 112 instrumented stack assignments, the largest observed linear-memory stack-pointer depth is still 96 bytes and the largest written watermark is 68 bytes. Every case restores its pointer and completes without error. These are observed depths, not worst-case guarantees, and exclude the Wasm engine's machine stack. Defaults remain 64 KiB stack, 1 MiB initial memory and 16 KiB shared synchronous transfer scratch.

Adding XML requires another HTML regression check. Against the pre-expansion checkpoint, initial Node 22 short runs (30 balanced blocks, eight replays per batch) measured filtered baseline/candidate ratios of 0.990/0.997 for native at 120/600 articles and 0.876/0.984 for pooled Wasm. Raw ratios were 0.966/0.997 and 0.880/0.975. The small pooled case therefore remains a concern, not a passed non-regression gate.

An isolated comparison with the immediately preceding HTML-expanded candidate measured 0.973 in 60 short blocks; its identical-code control measured 0.977. Separate-process comparisons measured 0.923 against a 0.971 control, but the two process blocks ranged from 0.895 to 0.950. Preventing XML helper inlining did not give a reliable improvement: the direct tuning comparison measured 0.981, and three fresh-process comparisons against the HTML-expanded candidate ranged from 0.875 to 1.034. That compiler annotation experiment was not retained. Existing O3/ThinLTO and target-feature defaults remain unchanged. These conflicting results leave strict HTML non-regression unresolved; they must not be averaged into a claim of parity.

A longer final repeat at 120 articles used six balanced process blocks, 400 warmups and 30 batches of 12 replays. Pooled Wasm measured 0.989 against the pre-expansion checkpoint; an identical-code control measured 0.974. Individual A/B blocks still ranged from 0.897 to 1.077, and A/A blocks from 0.957 to 1.087. This does not reproduce the initial 12% slowdown consistently, but the remaining spread prevents a strict non-regression claim.

Splitting XML into standard `xml.c`/`xml.h` translation units preserves the test results, zero Wasm imports and the measured stack watermarks. At 120 HTML articles, the before/after pooled-Wasm ratio was 1.008 in three separate-process blocks (1.007–1.030), while a mixed-implementation short run measured 0.896 with 29/30 blocks retained. This disagreement reinforces the runtime/order limitation; no performance advantage is claimed for the source-file layout.

Repeating the XML diagnostics with the final separate translation units and the same settings measured filtered speedups of 2.393× for native sitemap, 1.434× for native SVG, 2.135× for pooled-Wasm sitemap and 1.273× for pooled-Wasm SVG. Raw estimates were 2.406×, 1.434×, 2.167× and 1.298×; retained blocks were 23/24, 24/24, 23/24 and 23/24. These remain diagnostic workload results, with the same full-engine and noise limitations.

## Engine integration pass after d29bb5f

`d29bb5f` is the accepted implementation baseline for this pass. Cheerio remains the external performance baseline. The [isolated consumer replay](integration.md) now runs installed engine 0.9.1 and tracked MDN 0.7.4 transforms. Seven authored scenarios and eight saved MDN pages match Cheerio/parse5's serialized resource bodies and ordered discovery events on native and all three Wasm modes. The adapter includes deterministic disposal of nested loads. Resource I/O and URL policies are deterministic stand-ins; this is not the complete downloader or a universal adoption result.

Profiling identified repeated selector-evaluator initialization on template-bearing pages. Ordinary CSS now scans each fragment-free subtree through Lexbor, then merges fragment matches in preorder through existing node records/result storage. No temporary node array, sort, per-node JavaScript callback, or Lexbor patch is required. Special template/text pseudos retain a separate compatibility evaluator. In a diagnostic 50-replay comparison on the larger page, exclusive kernel query time fell from about 894 ms to 509 ms. This phase measurement supports the identified bottleneck; release timings below establish the practical effect. Long comma-separated removal selectors remain a substantial query cost.

Final release timings use Node 22, separate child processes, three balanced ABBA/BAAB blocks, 40 warmups and six batches of six replays per child. Startup and warmup are excluded. The table reports median baseline/candidate ratios; values above 1 mean faster. Each measured replay includes parse, facade/kernel calls, transformations, serialization, lifecycle cleanup and the deterministic URL/async work.

| Input | Native vs d29bb5f | Pooled Wasm vs d29bb5f | Native vs Cheerio/parse5 | Pooled Wasm vs Cheerio/parse5 |
|---|---:|---:|---:|---:|
| MDN-5, 94,642 bytes | 1.105× | 1.280× | 3.078× | 2.620× |
| MDN-8, 150,384 bytes | 1.232× | 1.461× | 4.626× | 3.899× |

All three blocks passed the independent CPU-probe filter except pooled Wasm against parse5 on MDN-5, where two passed; its unfiltered ratio was 2.745×. Other table entries have equal raw and filtered estimates. Raw samples are retained in private reports. The filter rejects entire balanced blocks only when max/min probe time exceeds 1.5; it never selects by implementation speed or ratio. Steady interference and GC can still affect precision.

The fastest baseline must also be considered. Using Cheerio's slim/htmlparser2 entry, both measured pages preserve equivalent reparsed HTML and identical resource events. Normalization runs outside timed child processes. Their byte serialization differs, and targeted generated-example/fragment cases still fail equivalence, so htmlparser2 is acceptable only for the demonstrated subset.

| Input | Native vs Cheerio/htmlparser2 slim | Pooled Wasm vs Cheerio/htmlparser2 slim |
|---|---:|---:|
| MDN-5 | 2.431× | 2.136× |
| MDN-8 | 3.202× | 2.850× |

All three blocks were retained for these comparisons. The initial root-entry experiment using only the private `_useHtmlParser2` flag lost parser settings during serialization; it is not an acceptable reference configuration and supplies no performance claim. The supported `xml: { xmlMode: false }` configuration and slim entry were subsequently checked.

The first feature-only timing pass appeared to slow native replay by roughly 8–11%, but crossed glue/kernel runs were rejected by control noise and an identical-code control also varied substantially. That signal is not a confirmed regression. The profiled template optimization above is retained based on final output checks and balanced release improvements. These selected large-page results meet 3× for native; pooled Wasm does not reach 3× on both. The full representative-workload gate remains open.

The ordinary authored HTML regression check uses six separate-process blocks, 400 warmups and 30 batches of 12 replays at 120 articles. Baseline/candidate ratios are 1.015 for native and 0.995 for pooled Wasm, with all six blocks retained. Individual blocks range from 0.961–1.049 and 0.955–1.043 respectively. This is consistent with parity at the measured precision; it does not support the initial short-run Wasm slowdown as a repeatable result.

XML regression diagnostics remain less precise. Short paired runs measured filtered native ratios of 0.946 for the 600-entry sitemap and 0.959 for the 300-group SVG, but their paired 10th–90th percentiles spanned roughly 0.78–1.24. The pooled-Wasm ratios were 1.032 and 0.985. A native repeat using four separate-process blocks, 200 warmups and 12 batches of eight replays measured raw ratios of 1.060/1.035 and filtered ratios of 1.128/1.079, retaining two/three blocks. The opposite directions do not establish a repeatable XML slowdown or speedup; small regressions cannot be excluded under this variability. All raw results remain available locally, including rejected blocks.

The 695-case test matrix passes its applicable cases: native 678/17 skipped, shared Wasm 680/15, document Wasm 681/14, and pooled Wasm 684/11. Native and pooled Wasm also pass on Node 24. Type checks and native ASan/UBSan with leak detection pass. The imported upstream selection remains 607 active cases and 11 exclusions.

Selector-cache churn and repeated text matching plateau after warmup. All four lifecycle diagnostics return tracked live bytes/documents to zero after disposal, including a large-then-small sequence and eight simultaneous owners disposed in varied order. Shared Wasm retains its grown linear memory; document heaps are released and pooled heaps remain under their configured idle limits, with trimming returning pooled backing memory to zero. These checks do not prove zero fragmentation or establish workload-specific retained-memory budgets.

The expanded Wasm stack diagnostic instruments 114 stack assignments. Ordinary authored replay still reaches 96 bytes, but the compatibility selector evaluator now uses more stack: nested successful `:has` reaches 6,192 bytes reserved / 6,184 written; the depth-limit rejection reaches 6,240 bytes reserved. All cases restore the pointer. The former 96-byte maximum therefore no longer describes the whole API. Keep the 64 KiB stack, 1 MiB initial memory, 16 KiB shared transfer scratch and bounded pool defaults. Release Wasm remains import-free and has no diagnostic exports.

## Performance and memory pass from `2c3c16e`

This pass keeps the kernel algorithms and compiler/heap defaults. It reuses private empty result arrays in each binding and drops the backend owner reference on disposal. The profile counts 100, 487 and 185 empty kernel results per MDN-1/5/8 replay respectively; these no longer need a new result array each time. Backing-allocation counters do not count these JS allocations. A separate `controlBytes` counter now exposes document control storage, including closed native records awaiting finalization.

The long removal-selector list remains a query hotspot. An experiment scanning each selector branch separately preserved outputs but did not establish a release improvement, so it was removed. No selector optimizer, Lexbor fork, new toolchain, protocol version, threading or Wasm feature change is retained.

### Release comparison with the baseline

Node 22.22.2, separate processes, three ABBA/BAAB blocks, 40 warmups and four batches of eight replays. Compilation/startup/warmup are excluded. All raw samples are retained; the unchanged filter rejects a complete block only when its independent CPU probes exceed a 1.5× max/min ratio. The values below are baseline/candidate elapsed ratios; above 1 favors the candidate.

| Consumer input | Native filtered ratio | Blocks kept | Pooled Wasm filtered ratio | Blocks kept |
|---|---:|---:|---:|---:|
| MDN-1, 3,365 bytes | 1.084 | 3/3 | 1.181 | 3/3 |
| MDN-5, 94,642 bytes | 1.061 | 3/3 | 1.023 | 2/3 |
| MDN-8, 150,384 bytes | 0.988 | 3/3 | 0.982 | 3/3 |

The raw pooled MDN-5 ratio is 1.058. An earlier five-block run of the allocation change measured native 1.120/1.022/0.989 and pool 1.070/1.009/0.989. The small-page improvement repeats; larger-page results do not establish a general gain. The final identical-code control measured 1.006 for MDN-1 and 0.959 for MDN-8, retaining 3/3 and 2/3 blocks. Large-page control blocks ranged 0.815–1.102, including rejected blocks. Stable interference, GC and runtime tiering can escape the CPU filter. The roughly 1–2% lower candidate ratios on MDN-8 cannot establish either a regression or strict non-regression at this precision.

Ordinary authored HTML uses 120 articles, three blocks, 160 warmups and eight batches of ten replays. Native is 1.014 and pooled Wasm 0.994, with all blocks retained. The corresponding 120-entry XML sitemap/SVG ratios are native 0.998/1.054 (3/3 and 2/3 retained; SVG raw 1.049), and pool 1.116/0.886 (2/3 and 3/3; sitemap raw 1.085). The apparent pooled SVG slowdown prompted a repeat with four blocks, 400 warmups and six batches of twenty replays. It measured 1.021 with all blocks retained, while its identical-code control measured 1.046 and ranged 0.946–1.198. XML differences are inconclusive; the initial slowdown is preserved in the report rather than discarded based on its outcome.

### Current Cheerio and backend panel

The same three-block consumer protocol includes complete transforms, bindings, serialization, explicit disposal and deterministic URL/resource stubs. It excludes network/disk and downloader scheduling. HTML uses current Cheerio/parse5; explicitly configured XML uses Cheerio's htmlparser2 XML mode. Engine 0.9.1's sitemap transform calls `load` without XML options, so its sitemap row exercises HTML parsing, despite the input format. It is not an XML-parser measurement. Outputs and resource events match exactly.

| Input | Native / current Cheerio speedup, raw | Filtered | Blocks kept |
|---|---:|---:|---:|
| MDN-1 | 3.656× | 3.656× | 3/3 |
| MDN-5 | 3.542× | 3.542× | 3/3 |
| MDN-8 | 4.153× | 4.153× | 3/3 |
| Four nested `srcdoc` levels | 2.368× | 2.368× | 3/3 |
| 240-group SVG | 2.327× | 2.482× | 2/3 |
| 600-entry sitemap | 2.352× | 2.343× | 2/3 |
| Compatibility-table rendering | 4.418× | 4.418× | 3/3 |
| Generated example | 2.519× | 2.519× | 3/3 |

Against `cheerio/slim` on the two larger saved HTML inputs, native measures 2.386× and 3.120× filtered (3/3 and 2/3 retained; MDN-8 raw 3.182×). This comparison reparses HTML outside timing and compares resource events exactly. It does not extend htmlparser2 compatibility to the previously failing fragment/generated-example cases.

| Wasm policy | MDN-1 elapsed / native elapsed | MDN-8 | Larger SVG |
|---|---:|---:|---:|
| Shared heap | 1.23× | 1.11× | 1.25× |
| Fresh heap per document | 2.59× | 1.34× | 2.30× |
| Bounded pool | 1.33× | 1.09× | 1.25× |

All three blocks are retained for each backend row. Native leads this panel. Shared and pooled Wasm remain useful alternatives; fresh instances pay a substantial recurring cost. Some representative scenarios remain below 3× over current Cheerio, and the corpus includes processed saved pages and authored cases. The full adoption gate remains open.

### Verification and memory

The existing 695-case matrix passes on all backends, with native/pool also checked on Node 24. An additional empty-snapshot mutation/disposal regression passes on all four backends. Native ASan/UBSan with leak detection passes the suite and added case. The frozen consumer's 87 TypeScript source files compile against both implementations, and 19 replay cases match on native/shared/fresh/pooled Wasm. Imported upstream coverage remains 607 active / 11 excluded cases.

The [memory report](memory.md) separates backing allocations, control records, owned linear capacity, idle retention and process observations. Its 2,430-lifetime stress run includes pinned owners, varied sizes/disposal order and retained selections, with deterministic authored-workload capacity ceilings. These results support bounded reuse for the exercised patterns, not a universal fragmentation proof or production memory budget.

## Whole-corpus optimization gate after `3fd1609`

The next measurement uses two fixed panels. The synthetic panel runs the authored HTML replay at 120 and 600 articles, then the authored 120-entry sitemap and SVG replays. The consumer panel runs all eight saved MDN pages and all eleven authored consumer scenarios described in [integration](integration.md). Each iteration runs every entry once, in manifest order, including bindings, required callbacks, serialization and disposal. The aggregate is the ratio of total panel times, never an average of individual speedups. These equal-entry weights define a reproducible diagnostic gate; they are not an observed production traffic distribution.

Set `aggregate: true` in a `bench/process.mjs` manifest to measure this contract. Entries can specify `rows` or a preloaded `path`, and a `workload` override for mixed synthetic HTML/XML. Reports include input byte counts and SHA-256 fingerprints without machine paths. These fingerprints identify benchmark inputs; they are not part of the kernel protocol. Without `aggregate`, the harness continues to time entries individually.

Before examining gate results, the protocol is fixed at five alternating ABBA/BAAB process blocks, 40 complete-panel warmups, six timed batches, and two complete panels per batch. Keep the existing independent-probe filter at 1.5 and retain every raw block. An identical-code control uses the same panel and settings. A scoped pass requires both raw and filtered median ratios above the relevant boundary (3 against current Cheerio, 1 against the fastest compatible configuration), at least three retained blocks, and every retained block above that boundary. If the control's raw or filtered median lies outside 0.90–1.10, report the gate as inconclusive. This is a conservative operational rule, not a statistical confidence interval or a way to correct candidate timings by dividing by the control.

Compare native and pooled Wasm independently. Keep fresh/shared Wasm lifecycle and correctness coverage; this gate does not require every experimental backend to qualify for adoption. Audit htmlparser2 output and resource events before timing it as an acceptable baseline. Incompatible parser configurations remain explicit exclusions; a compatible subset comparison cannot pass the complete-panel gate. Report per-category limitations and retain the distinction between this deterministic replay and production adoption.

### Selector changes and diagnostic evidence

The retained experiment specializes standalone tag, ID and class plans, and filters lists of at least eight branches when every branch has a necessary tag, ID or class in its rightmost compound. Only candidate branches invoke Lexbor's general matcher. Unknown-only tag plans skip traversal, but retry missing name IDs on the next query so insertion and renaming remain visible. Metadata shares the bounded selector arena; neither matching nor traversal allocates a temporary object per element. Compatibility pseudos retain their existing evaluator. See the [source review](research.md#selector-optimization-techniques-reviewed) for related Cheerio, jQuery and WebKit techniques.

Separate instrumented native runs execute 60 real consumer replays per input. Exclusive query time falls from 4.05 to 3.11 ms on MDN-5 and from 8.81 to 6.44 ms on MDN-8. On MDN-8 the specialized paths visit 37,806 elements, pass 465 necessary-atom checks and invoke the general branch matcher 424 times per replay; the remaining candidates are standalone atoms. These counts explain avoided work. Instrumented elapsed times, including the new counters, are diagnostic rather than release speedups or retired-instruction measurements.

Four new differential tests cover duplicate IDs, CSS escapes/whitespace, template scopes, compound/list matching, insertion/renaming after a cached miss, snapshots and overlapping-root deduplication. The 700-case matrix passes across native/shared/fresh/pooled Wasm, and native/pool pass on Node 24. All 19 consumer outputs and ordered resource events match on every backend. Release Wasm still has zero imports and no diagnostic exports. The [memory recheck](memory.md#selector-optimization-recheck) passes unchanged lifetime budgets, with direct Node ASan/UBSan and leak detection clean. Compiler, target-feature, heap, stack and transfer-buffer defaults are unchanged.

### Node 22 gate results

Node 22.22.2, Cheerio 1.2.0, release O3/ThinLTO, with the five-block protocol above. The synthetic panel contains 200,230 input bytes; the 19-case consumer panel contains 637,377. Current Cheerio uses parse5 for HTML and htmlparser2 for XML. Source-location tracking is already disabled by default; explicitly setting that parse5 option supplies no different algorithm. Every iteration includes a fresh DOM and complete transform/serialization/disposal for each entry.

| Baseline and panel | Native raw / filtered speedup | Blocks kept | Pooled Wasm raw / filtered speedup | Blocks kept |
|---|---:|---:|---:|---:|
| Current Cheerio, synthetic | 4.769× / 4.769× | 5/5 | 3.911× / 3.911× | 5/5 |
| Current Cheerio, all 19 consumer cases | 3.988× / 3.988× | 5/5 | 3.369× / 3.369× | 5/5 |
| Cheerio/slim, synthetic | 3.300× / 3.385× | 4/5 | 3.050× / 3.050× | 5/5 |
| Cheerio/slim, eight saved MDN pages | 3.277× / 3.277× | 5/5 | 2.832× / 2.832× | 5/5 |

The native current-Cheerio block ranges are 4.552–4.813× synthetic and 3.933–4.045× consumer; pool ranges are 3.742–4.256× and 3.230–3.415×. Identical-code controls retain all five blocks and have raw/filtered medians of 0.996/0.997 for native synthetic/consumer and 1.023/1.021 for pool. Both implementations therefore pass the stated numerical rule on these fixed Node 22 panels. Steady interference can escape probe filtering; these operational checks are not confidence intervals or unconditional throughput guarantees.

The synthetic slim comparison matches output exactly. All eight saved MDN pages match after HTML normalization outside timing, with exact resource-event comparison. Four authored cases remain incompatible with slim: HTML with nested `srcdoc`, playable fragments, generated examples, and four nested document levels. Generated examples also change resource events. The complete consumer-panel baseline therefore remains the compatible current Cheerio configuration; the slim subset win is additional evidence, not a substitute complete-panel pass.

Against `3fd1609`, the same complete-panel protocol measures native 1.104× and pool 1.140× on the consumer replay, with all five blocks retained. Their ranges, 1.087–1.127× and 1.131–1.154×, support a repeatable improvement beyond the corresponding controls. Synthetic before/after medians are 1.047× and 1.050×, but ranges are wider: 0.978–1.121× and 1.014–1.136×. Those smaller differences do not establish a consistent gain for every synthetic case. Earlier per-case native experiments were near parity on ordinary HTML/XML; no claim of universal speedup or strict absence of a small regression follows from the aggregate.

These panels satisfy a scoped performance checkpoint. They combine saved, already processed pages and authored scenarios under actual consumer transforms; they are not a production traffic distribution or a complete crawl. XML, nested/generated cases and other individual inputs can remain below 3×. The agreed multiplier applies to the fixed aggregate, and broader adoption still needs representative production weights, cold-start measurements, integration deployment and release checks.

### Native repeat on Node 24

With identical inputs and the same five-block protocol, Node 24.18.0 measures 4.704× synthetic and 4.025× consumer versus current Cheerio. Raw and filtered medians agree; all five blocks are retained. Ranges are 4.414–4.911× and 3.922–4.681×. Identical-code controls measure 1.005 and 1.013, with 5/5 and 3/5 blocks retained respectively; two consumer-control blocks fail the independent probe filter. Both panels pass the same numerical rule.

Native versus slim measures 3.596× synthetic (raw and filtered, 5/5 retained) and 3.267× raw / 3.246× filtered on the eight saved MDN pages (4/5 retained). The parser-compatibility exclusions above still apply. Pooled Wasm is correctness-tested on Node 24 in this pass; its new whole-corpus performance gate is measured on Node 22.

The final focused long-list diagnostic on Node 22 measures baseline/candidate ratios of 1.918× sparse and 2.703× dense, with three of three process blocks retained in each case. It uses 80 warmups and six batches of eight replays, and includes parsing plus repeated queries. It isolates selector behavior and carries no additional adoption claim.

## XML optimization gate after `8c785fb`

This pass targets explicit XML mode, independently of the mixed-panel result. Freeze the authored sitemap at 120/600 entries and SVG at 120/300 groups, using `bench/xml-fixtures.mjs` for complete parse/query/callback/mutation/serialization/disposal replays. Compare native and pooled Wasm separately against current Cheerio `{ xml: true }` (htmlparser2). Report each input and the equal-entry whole-panel ratio; pursue 3× on XML without hiding a slower category. Also retain the real consumer SVG path. The engine's unchanged sitemap path uses HTML mode and remains a consumer regression case, not an explicit XML baseline.

Final release comparisons use five alternating ABBA/BAAB blocks, 80 warmups, six batches and eight replays per batch for individual authored XML inputs. Complete panels retain the earlier 40-warmup, six-batch, two-replay settings. Keep every sample and the independent-probe max/min rejection threshold of 1.5. Identical-code controls use matching settings. Require at least three retained blocks and raw/filtered medians and retained blocks above 3× before declaring an XML performance pass. Controls outside 0.90–1.10 make the result inconclusive; do not divide timings by controls or reject blocks based on speedup. Exploratory screens may use three blocks and must be labeled diagnostic.

HTML regression checks compare against `8c785fb` on the 120/600-article authored HTML panel, all eight saved MDN pages, and the complete consumer panel. Keep the established current-Cheerio performance gates. Investigate any repeatable slowdown; the operational regression screen requires raw/filtered baseline/candidate ratios at least 0.98 with matching controls within 0.98–1.02. This is a measurement tolerance, not permission to trade HTML speed for XML gains or proof of exact zero regression. An inconclusive screen requires further diagnosis, not a pass. Behavior, explicit disposal, all Wasm modes and existing sustained memory budgets remain required.

Several initial regression controls drifted outside the 2% tolerance despite passing the independent CPU probe. Before examining follow-up results, repeat the HTML/saved-MDN/complete-consumer comparisons and matching controls with the same five-block settings and a fixed process affinity. Select one permitted logical CPU from an independent utilization sample before running the panel, then use it for every child process in that replication. This changes no host-wide configuration or library threading. Keep the original samples and report the affinity replication separately; steady interference can still escape filtering.

The pooled SVG controls also exceed the 0.90–1.10 XML tolerance in the initial panel. Extend the affinity replication to individual XML cases and the XML aggregate, with their matching controls and original warmup/batch settings. Preserve the failed controls; do not use the initial SVG ratios as passed measurements.

The native complete-consumer control remains outside the 2% regression tolerance in the affinity replication. Add one predetermined five-block control run on the same affinity and combine all ten blocks, keeping each block's original probe decision. Do not choose the better run or adjust candidate speedups by the control. Repeat the pooled synthetic/current-Cheerio gate and its control on that affinity after its initial control failed the 10% adoption tolerance. Compare the compatible synthetic and saved-MDN panels with Cheerio/slim there as well.

### Retained changes and rejected experiments

The retained implementation caches XML element/attribute names in the document arena, compares closing tags with the known parent name, and checks duplicate attributes by case-sensitive IDs. Callback setters avoid internal selection wrappers; scalar reads pass an integer ID; command views are reused. The [research notes](research.md#xml-algorithms-reviewed) describe the library/browser references, and [memory](memory.md#xml-optimization-recheck) records ownership and capacity checks.

Exploratory before/after XML panels showed substantial gains from removing callback wrappers and specializing scalar reads. The final unpinned XML panel measures baseline/candidate medians of 1.877× native and 1.884× pooled Wasm, with five of five blocks retained. Matching controls are 0.996 native and 0.959 raw / 0.917 filtered pool, with five/three retained blocks. These controls support a large improvement but not a precise universal multiplier.

The scanner experiment using libc `memchr` had mixed results and was removed. Native full LTO and Wasm bulk-memory screens measured only 1.031× and 1.025× in three blocks; no sufficient cross-workload evidence justified changing defaults. A later Wasm operand-cache experiment reduced `gk_input` calls from 614 to 16 on the 300-group SVG replay, yet its five-block complete XML panel measured 0.934× against the retained implementation. Its attribution remains uncertain without a matching control, but it supplied no evidence of a release gain and was removed. Fewer calls alone do not establish better performance. O3/ThinLTO and default Wasm features remain unchanged.

### Initial release gates

Node 22.22.2, Cheerio 1.2.0, unchanged release/compiler/heap defaults. Ratios include bindings, required callbacks, mutations, serialization and disposal. The consumer panel also includes deterministic resource/URL/async work.

| Panel against current Cheerio | Native raw / filtered | Blocks kept | Pool raw / filtered | Blocks kept |
|---|---:|---:|---:|---:|
| Synthetic HTML + XML | 5.178× / 5.178× | 5/5 | 4.829× / 4.829× | 5/5 |
| Complete 19-case consumer | 4.117× / 4.117× | 5/5 | 3.805× / 3.805× | 5/5 |
| Explicit XML panel | 3.659× / 3.659× | 5/5 | 2.681× / 2.639× | 3/5 |

Native passes the stated 3× rule on all three initial panels. Both backends pass it on the complete consumer panel: matching native/pool controls are 0.958/0.973, with five/three retained blocks. The synthetic native control is 0.977 raw / 0.901 filtered, with three retained blocks, close to the lower control boundary. The pooled synthetic control is 1.058 raw / 1.140 filtered and fails the 10% tolerance; its apparent speedup is not a newly passed gate. The pooled XML panel falls below 3×. Every initial/rejected sample remains retained locally.

### Affinity replication and XML categories

| Explicit XML replay | Native raw / filtered | Blocks kept | Pool raw / filtered | Blocks kept |
|---|---:|---:|---:|---:|
| Sitemap, 120 entries | 4.291× / 4.291× | 5/5 | 3.545× / 3.545× | 5/5 |
| Sitemap, 600 entries | 4.648× / 4.648× | 5/5 | 3.941× / 4.070× | 4/5 |
| SVG, 120 groups | 3.777× / 3.777× | 5/5 | 3.019× / 3.019× | 5/5 |
| SVG, 300 groups | 3.426× / 3.426× | 5/5 | 2.791× / 2.791× | 5/5 |

All matching category control medians meet the 0.90–1.10 tolerance, with at least four retained blocks. Both sitemap sizes pass the strict 3× rule for both backends in this replication. Native SVG-120 passes. Native SVG-300 has a retained 2.931× block, and pooled SVG-120 has retained blocks below 3×; those two rows do not pass despite their medians. Pooled SVG-300 remains below target.

The XML aggregate measures native 4.436× raw / 3.960× filtered, but only two of five blocks survive, making that replication inconclusive. Pooled Wasm measures 3.372× with all five blocks retained and a 1.067 control. One retained block is 2.978×, so **pooled XML still does not pass the strict aggregate rule**. The initial native XML gate remains a scoped pass; the results do not establish a universal XML multiplier.

The separate real consumer SVG path remains slower relative to Cheerio: native 2.863× (5/5 retained), pool 2.502× raw / 2.418× filtered (4/5). It performs a different transform from the authored XML replay and is not interchangeable with that replay. Engine 0.9.1's sitemap path still parses as HTML.

### HTML regression checks and remaining uncertainty

The following affinity ratios compare `8c785fb` with the retained implementation; above 1 favors the candidate.

| Panel | Native raw / filtered | Native control | Pool raw / filtered | Pool control |
|---|---:|---:|---:|---:|
| HTML at 120 + 600 articles | 1.353 / 1.353 | 1.012 | 1.147 / 1.147 | 0.999 / 1.012 |
| Eight saved MDN pages | 1.055 / 1.055 | 1.014 | 1.062 / 1.066 | No retained blocks |
| Complete consumer panel | 1.015 / 1.015 | 0.986, combined ten blocks | 1.019 / 1.158 | Only one retained block |

Native passes the defined regression screen on all three panels; its combined consumer control retains eight of ten blocks. Pooled Wasm passes the authored HTML panel. Its saved-MDN control retains no blocks, and its complete-consumer comparison/control retain only one each. Those pooled regression checks remain **inconclusive**, not passed non-regression gates. Fixed affinity did not eliminate host interference.

The repeated pooled synthetic/current-Cheerio comparison measures 4.930× but retains only one block; its control retains two, so it remains inconclusive. Cheerio/slim comparisons are also diagnostic: synthetic native/pool raw medians are 4.052×/3.429×; saved-MDN medians are 3.587×/3.195×. Some comparisons or their matching controls retain fewer than three blocks. Output/resource audits still pass on the compatible subsets, with the previously documented generated/nested-fragment exclusions. These results do not add new strict slim gates.

The 709-case matrix passes on native/shared/fresh/pooled Wasm, with native/pool also checked on Node 24. All 19 consumer outputs match the accepted reference on every backend; types, direct Node ASan/UBSan with leak detection, and existing sustained memory budgets pass. Performance timing in this pass is on Node 22. Native XML has a demonstrated improvement and a scoped 3× aggregate pass. Pooled XML's strict gate and the noise-limited pooled MDN checks remain open; neither production adoption nor universal absence of a small regression is claimed.

### Follow-up measurement protocol

After checkpoint `d1de718`, the next Wasm experiment combines pending writes and the following read in one export, borrowing the read name only during that synchronous call. Before viewing its measurements, retain the existing five-block settings and probe filter, but select a permitted CPU from an independent one-second utilization sample before each balanced block. Pin all four processes of the block to that CPU. `GROVEDOM_BENCH_AFFINITY=quiet` enables this Linux diagnostic through `/proc` and `taskset`; it changes neither library threading nor host configuration. Selection never uses implementation timings, and no blocks are retried or dropped because of their speedup. Keep matching controls and all original evidence. Screen the experiment against the checkpoint before making any new gate claim.

The first comparison retains no blocks: raw candidate gain 1.131×, control 0.970×, with all five blocks rejected in each run. Control probe ratios range from 1.79 to 3.32. This supplies no accepted speedup or non-regression evidence. A further five-block XML comparison/control will be combined with these original blocks rather than selecting a favorable run; use the same rules for the authored HTML screen.

The original saved-MDN input locations became unavailable during the follow-up. Eight selected members were extracted from the latest available en-US/zh-CN archives dated 2026-10-03, totaling 511,533 bytes. Only those eight files were extracted. Their portable member names and SHA-256 hashes are in [the sample manifest](../bench/mdn-samples.json). Four live-example inputs match the original hashes; the four larger pages differ despite unchanged sizes. Treat the refreshed saved/consumer panels as a new corpus revision: compare all implementations on the same new bytes, retain historical reports separately, and never combine their timings with the old corpus. Authored HTML/XML inputs and the isolated engine/MDN source snapshot remain unchanged.

The combined-export experiment is set aside. Its XML repeat measures 0.961× with five blocks retained, while its repeat control is 0.805 raw / 0.861 filtered with four retained. The authored HTML comparison is 1.009 raw / 1.017 filtered, but its 0.920 control fails the regression tolerance. A separate XML/current-Cheerio panel measures 4.062× with five retained blocks; the failed control prevents a passed-gate claim. All original and repeated samples remain available. Fewer boundary calls did not establish an incremental release gain. Its 710-case matrix, refreshed 19-case consumer output replay, and authored/refreshed Wasm memory budgets pass, but the release implementation keeps the earlier transport.

An XML parser experiment decoded entities inside each final DOM-owned text/attribute value. Replacement cannot expand the original entity spelling; the parser retained no input-buffer aliases. This removed intermediate scratch writes and copies, following the in-place conversion idea reviewed in pugixml/TinyXML-2 without borrowing their ownership model. Ordinary XML peak backing capacity was unchanged in the SVG/sitemap probes. However, a deliberately entity-dense input increased tracked peak capacity from 3,598,760 to 3,976,520 bytes native and 9,732,472 to 10,108,152 bytes Wasm: reserving each value at its original spelling length costs more than reserving the shorter decoded value. Full XML ratios were 0.940× native and 1.013× pool, with controls 1.041/1.051; all five blocks survived in each run. Those small/mixed timing differences do not justify the extra capacity, so this experiment was removed as well.

### XML callback allocation follow-up

This experiment delays one-node array creation for XML handles and reuses one document-owned ID array for immediate callback reads/writes. Reacquire the borrowed array after user callbacks and string coercion; actual selections still own stable arrays. An earlier version changed common scalar-command helpers and failed the native authored-HTML regression screen (0.922× with a 0.986 control), so that version was removed. The XML-specific candidate preserves the existing command helpers and HTML handle records.

For a complementary diagnostic, copy the identical XML fixture module for each implementation so its `load` call sites stay separate, then run both implementations in short balanced blocks within one process. Use 20 ABBA/BAAB blocks, four replays per batch and 200 warmups on sitemap-600/SVG-300, retaining the same probe-only filter. Repeat in five fresh processes, reverse import order in the second/fourth, and use separate identical source/artifact/workload copies for controls. Keep the initial pool screen as the first repetition. An initial control sharing one module/instance is diagnostic only and is replaced by the properly isolated control copy. These checks help distinguish small changes from between-process drift; they do not replace the existing fresh-process performance and HTML/MDN gates.

The refined candidate's first pooled authored-HTML process screen is close to the regression tolerance: 0.972 raw / 0.983 filtered, control 1.023. Before inspecting a repeat, expand the authored-HTML comparison and control to ten process blocks for both backends. Combine the existing five pooled blocks with exactly five additional blocks; run ten for native as well. Retain the original probe decisions, all raw ratios and the 2% tolerance. This fixed extension estimates the small change more precisely; it does not select runs by favorable speedup.

The ten-block pooled HTML result is 0.999 raw / 1.003 filtered, with nine retained blocks and a 1.000 control retaining all ten. It passes that regression screen. The first refreshed saved-MDN comparison is 0.968 with a 1.019 control (five retained in each), so that screen does not pass. The complete-consumer comparison/control retain only two blocks each. These results require diagnosis before retaining the candidate. V8 traces show that both versions inline the handle constructor into `wrap` and `each`; missed constructor inlining does not explain the concern.

A further diagnostic keeps each implementation in its own process but alternates requests between two warmed processes, shortening the interval between their measurements without mixing facade shapes or GC heaps. Use five fresh process pairs, five alternating ABBA/BAAB blocks per pair, 40 whole-corpus warmups, and the same six batches of two complete replays per request. Reverse process-start order in alternate pairs. Select one permitted CPU independently before each pair and pin both processes to it; only one runs a requested replay at a time. IPC, startup, warmup and idle time are excluded; every replay still creates, transforms, serializes and disposes its documents. Keep every sample and the 1.5 probe-only filter. Apply the same 2% control/non-regression tolerances, with at least three retained blocks in at least three pairs. Run the matching identical-code control first. This is a diagnostic of the conflicting MDN timing, not permission to overlook the failed screen.

That candidate's paired saved-MDN result is 0.990 raw / 0.989 filtered, retaining 22 of 25 blocks, with a 1.005 control retaining 24. All five raw pair medians are below one. The earlier failed screen remains relevant; these results do not establish that the change is free of a small slowdown. Its short XML diagnostic shows median filtered gains of 1.018/1.051 native and 1.026/1.028 pool on sitemap-600/SVG-300, with controls near one. Pooled XML and mixed synthetic aggregate screens reach 3.473× and 4.702× current Cheerio with valid controls and all five blocks retained. Those passes apply to this experimental candidate, which is not the release checkpoint.

The next revision moves XML callback handling outside the HTML callback loops, retaining the checkpoint's HTML loop bodies. Focused reentry/disposal checks pass. Its first saved-MDN process comparisons favor the revision (1.045 native and 1.039 pool), but the native control retains only two blocks and the pooled control is 1.021 raw / 1.024 filtered. Both screens are inconclusive. Before further timing, apply the same five-pair protocol to this revision versus the checkpoint on saved-MDN and complete-consumer panels, with separate matching controls for each backend.

A separate three-process short diagnostic adds the previously set-aside combined Wasm export to this revision. Median filtered gains are 1.071 on sitemap-600 and 1.064 on SVG-300; controls are 0.999 and 1.027, with substantial between-process spread, including a 1.150 sitemap control. This does not establish a sufficiently reliable incremental gain to retain the additional transport implementation. The kernel and compiler defaults remain unchanged.

The XML-specific callback revision's paired checks compare with `d1de718` on the refreshed corpus. Ratios above one favor the revision; these are regression checks, not current-Cheerio speedups.

| Panel | Backend | Raw / filtered | Blocks retained | Control raw / filtered | Control blocks | Regression screen |
|---|---|---:|---:|---:|---:|---|
| Saved MDN | Native | 0.998 / 0.998 | 23/25 | 0.981 / 0.991 | 23/25 | Pass |
| Saved MDN | Pool | 1.018 / 1.025 | 21/25 | 1.005 / 1.005 | 24/25 | Pass |
| Complete consumer | Native | 1.008 / 1.008 | 21/25 | 1.019 / 1.032 | 18/25 | Inconclusive control |
| Complete consumer | Pool | 0.996 / 0.996 | 22/25 | 0.999 / 0.999 | 25/25 | Pass |

Each comparison/control has at least four process pairs with three or more retained blocks. The table uses the median of the five raw/filtered pair medians. Passing the 2% screen does not prove exact zero slowdown. The native complete-consumer result stays inconclusive; its failed filtered control is not normalized away or replaced by the raw control.

The revision's authored-HTML process comparisons use ten balanced blocks per backend, as predeclared. Native measures 1.050 raw / 1.054 filtered with nine retained blocks, but the 0.977 control is outside the 2% tolerance, so that screen is inconclusive. Pooled Wasm passes at 1.008 with all ten blocks retained and a 1.003 control retaining all ten. No timing samples are discarded based on the candidate's ratio.

The final aggregate process screens use the unchanged five-block settings and current Cheerio 1.2.0. Explicit XML uses Cheerio XML/htmlparser2. The minimum column is the smallest retained balanced-block ratio; controls use the same workload and settings.

| Panel | Backend | Raw / filtered | Blocks retained | Minimum retained | Control raw / filtered | Control blocks | 3× screen |
|---|---|---:|---:|---:|---:|---:|---|
| Explicit XML | Native | 3.775 / 3.511 | 3/5 | 3.414 | 0.985 / 0.960 | 4/5 | Pass |
| Explicit XML | Pool | 3.331 / 3.331 | 5/5 | 3.176 | 0.976 / 0.976 | 5/5 | Pass |
| Synthetic HTML + XML | Native | 5.502 / 5.502 | 3/5 | 4.976 | 0.958 / 0.958 | 5/5 | Pass |
| Synthetic HTML + XML | Pool | 4.819 / 4.637 | 4/5 | 3.688 | 1.013 / 1.000 | 4/5 | Pass |
| Complete consumer | Native | 4.093 / 4.093 | 3/5 | 3.974 | 0.969 / 1.052 | 3/5 | Pass |
| Complete consumer | Pool | 3.400 / 3.413 | 2/5 | 3.400 | 0.999 / 0.999 | 5/5 | Inconclusive: too few blocks |

Individual XML replays retain the predeclared five blocks, 80 warmups, six batches and eight replays per batch. All comparison and control blocks survive in this replication, so raw and filtered medians are identical.

| XML input | Backend | Median vs Cheerio XML | Minimum block | Control median | 3× screen |
|---|---|---:|---:|---:|---|
| Sitemap, 120 entries | Native | 3.967 | 3.430 | 0.896 | Inconclusive control |
| Sitemap, 600 entries | Native | 5.779 | 4.531 | 1.065 | Pass |
| SVG, 120 groups | Native | 3.102 | 2.665 | 1.077 | Retained blocks below target |
| SVG, 300 groups | Native | 3.383 | 2.784 | 1.041 | Retained blocks below target |
| Sitemap, 120 entries | Pool | 3.425 | 3.121 | 0.991 | Pass |
| Sitemap, 600 entries | Pool | 3.587 | 3.412 | 0.988 | Pass |
| SVG, 120 groups | Pool | 2.823 | 2.497 | 1.019 | Below target |
| SVG, 300 groups | Pool | 2.807 | 2.586 | 0.995 | Below target |

Both backends now pass the explicit XML aggregate in this replication. That does not establish the 3× target for SVG: native SVG has retained blocks below three, and pooled SVG medians remain below three. The native authored-HTML/full-consumer regression controls and the refreshed pooled consumer adoption screen also remain open. Earlier passes and rejected/inconclusive replications are retained separately; these results neither replace the corpus nor prove a universal speedup.

An allocation-count diagnostic compares the checkpoint and this revision outside timing. Single-ID `Uint32Array` creation falls from 601 to two on sitemap-600 and from 301 to two on SVG-300: one root array and one reusable callback array remain. This removes 599/299 arrays per replay. Actual selections still materialize stable arrays when needed; node wrappers, records and kernel result arrays remain. These counts do not measure total JS heap bytes or establish an incremental elapsed-time multiplier.

The retained revision passes the 711-case matrix: native 694 passes/17 skips, shared Wasm 696/15, fresh Wasm 697/14 and pooled Wasm 700/11. Native/pool also pass on Node 24. All 19 refreshed consumer outputs and resource events match Cheerio on every backend. Types, the rebuilt native ASan/UBSan suite with leak detection, and the authored 2,430-lifetime memory budgets pass. Refreshed-corpus lifecycle diagnostics are separate from those fixed budgets. Release Wasm still has zero imports and no diagnostic exports. This is a validated allocation checkpoint; the remaining performance gates above keep the broader optimization goal open.

### XML tag scans and attribute storage

The follow-up after `62a6341` profiles 8,000 full SVG-300 replays per backend with 100 µs CPU sampling. Pooled GC accounts for about 1% of samples; query traversal, parsing, serialization and allocator work remain more useful targets. Separate profile elapsed times are not paired speedups.

A standalone tag query now resolves its ID once and scans preorder directly. It retains the existing scope, fragment-crossing, collection, deduplication and snapshot behavior. XML also disables Lexbor's internal HTML insertion/attribute hooks; ordinary DOM links and ID/class pointers still update. The shared growing-attribute path fixes a pinned Lexbor old-value retention defect while preserving HTML callbacks. See [the source audit](research.md#xml-and-template-implementation-findings) and [capacity measurements](memory.md#attribute-value-retention). There is no new index, cache, protocol field, export, dependency, thread or compiler default.

The initial isolated short comparison uses the same five fresh-process repetitions, separate fixture copies, 20 balanced blocks and four replays per batch described above. Import order reverses in the second and fourth repetitions. The following candidate contains the tag scan and XML hook change, before the additional HTML old-value cleanup. Ratios are baseline/candidate; controls are separate identical source/artifact copies. Each cell reports the median of five process medians, without control normalization.

| Backend | XML input | Raw / filtered gain | Comparison blocks | Control raw / filtered | Control blocks |
|---|---|---:|---:|---:|---:|
| Native | Sitemap, 600 entries | 1.037 / 1.035 | 96/100 | 1.000 / 0.998 | 97/100 |
| Native | SVG, 300 groups | 1.027 / 1.025 | 99/100 | 0.994 / 0.994 | 98/100 |
| Pool | Sitemap, 600 entries | 1.061 / 1.055 | 97/100 | 0.994 / 0.995 | 97/100 |
| Pool | SVG, 300 groups | 1.046 / 1.046 | 99/100 | 0.989 / 0.989 | 99/100 |

All five candidate repetition medians exceed one for each case. Individual control drift remains visible in the retained raw reports; this is evidence for modest incremental gains, not completion of the per-input 3× gate. The tag-only intermediate comparison was less consistent and remains separate.

The final candidate includes HTML buffer cleanup as well. Regression measurements compare it with `62a6341` on authored HTML, the eight refreshed MDN samples and the complete 19-case consumer panel. Use five fresh process pairs with five balanced blocks each, 40 whole-corpus warmups, six batches of two replays and the unchanged probe filter. Each pair shares an independently selected CPU; only one child measures at a time. Retain the 2% comparison/control tolerances and require at least three retained blocks in at least three pairs. Absolute adoption screens keep the established five fresh-process blocks and 10% control tolerance; individual XML cases use 80 warmups and eight replays per batch.

The final candidate's incremental XML comparison uses that same five-pair method across all four XML inputs. Native improves 1.060× and pool 1.067×, with raw and filtered estimates equal and all 25 blocks retained. Matching controls are 1.000/1.003, retaining all 25 blocks. Every candidate pair median exceeds one: native 1.035–1.123 and pool 1.055–1.076. Native control pair medians span 0.958–1.030, so the reported 6–7% improvement is a scoped estimate, not an exact universal multiplier.

The initial native authored-HTML result is 1.008 with a 0.972 control; all 25 blocks survive, but the control misses the 2% tolerance. Before examining additional results, extend both comparison and control by five process pairs and combine all ten. Preserve the original results and probe decisions; do not select the better replication. Other regression panels retain their original five-pair counts.

| Regression panel | Backend | Raw / filtered | Blocks retained | Control raw / filtered | Control blocks | Screen |
|---|---|---:|---:|---:|---:|---|
| Authored HTML | Native | 1.007 / 1.007 | 50/50 | 0.993 / 0.993 | 50/50 | Pass |
| Saved MDN | Native | 0.991 / 0.991 | 25/25 | 0.998 / 0.998 | 25/25 | Pass |
| Complete consumer | Native | 1.017 / 1.026 | 22/25 | 0.999 / 0.999 | 22/25 | Pass |
| Authored HTML | Pool | 1.007 / 1.007 | 25/25 | 1.009 / 1.009 | 25/25 | Pass |
| Saved MDN | Pool | 1.003 / 1.003 | 25/25 | 1.005 / 1.005 | 25/25 | Pass |
| Complete consumer | Pool | 1.002 / 1.002 | 25/25 | 1.003 / 1.003 | 25/25 | Pass |

All six regression screens pass. The native authored-HTML row combines ten pairs; each other row uses five. Passing this tolerance does not prove exactly zero slowdown. The same refreshed archive inputs and consumer behavior remain fixed throughout these comparisons.

| Adoption panel | Backend | Raw / filtered vs Cheerio | Blocks retained | Minimum retained | Control raw / filtered | Control blocks | 3× screen |
|---|---|---:|---:|---:|---:|---:|---|
| Explicit XML | Native | 3.522 / 3.522 | 5/5 | 2.605 | 0.946 / 0.946 | 5/5 | Retained block below target |
| Synthetic HTML + XML | Native | 5.567 / 5.425 | 4/5 | 4.943 | 0.945 / 0.945 | 5/5 | Pass |
| Complete consumer | Native | 3.909 / 3.909 | 5/5 | 3.117 | 1.002 / 1.002 | 5/5 | Pass |
| Explicit XML | Pool | 3.572 / 3.572 | 5/5 | 3.384 | 1.013 / 1.013 | 5/5 | Pass |
| Synthetic HTML + XML | Pool | 4.914 / 4.914 | 5/5 | 4.887 | 0.995 / 0.995 | 5/5 | Pass |
| Complete consumer | Pool | 3.480 / 3.480 | 5/5 | 3.431 | 1.008 / 1.008 | 5/5 | Pass |

| XML input | Backend | Median vs Cheerio XML | Minimum retained | Control median | 3× screen |
|---|---|---:|---:|---:|---|
| sitemap-120 | Native | 4.136 | 3.784 | 1.050 | Pass |
| sitemap-600 | Native | 4.860 | 3.893 | 1.015 | Pass |
| svg-120 | Native | 3.599 | 2.697 | 1.027 | Retained block below target |
| svg-300 | Native | 3.200 | 3.025 | 0.995 | Pass |
| sitemap-120 | Pool | 3.467 | 3.331 | 0.996 | Pass |
| sitemap-600 | Pool | 4.398 | 4.300 | 1.000 | Pass |
| svg-120 | Pool | 2.850 | 2.497 | 0.997 | Below target |
| svg-300 | Pool | 2.725 | 2.342 | 0.997 | Below target |

Every individual XML comparison/control retains all five blocks, so raw and filtered medians agree. Native SVG-300 now passes this replication, but native SVG-120 and both pooled SVG sizes remain open. The native XML aggregate also has a retained block below three, despite its median and the previous checkpoint's aggregate pass. No unfavorable block is discarded based on its speedup. Both backends pass the mixed synthetic and refreshed consumer aggregate rules; this does not establish the same multiplier for every input or deployment.

The final 716-case matrix passes: native 699 passes/17 skips, shared Wasm 701/15, fresh Wasm 702/14 and pooled Wasm 705/11. Native/pool also pass on Node 24; all 19 refreshed consumer outputs/events match on all four backends. Types, the rebuilt native ASan/UBSan suite with leak detection, and the authored 2,430-lifetime memory budgets pass. Refreshed-corpus lifecycle diagnostics remain separate from the fixed budgets. Release Wasm has zero imports and no diagnostic exports.

## Plain tag queries and Wasm observations

The follow-up after `4d33ee8` avoids CSS parsing for plain ASCII tag names and initializes CSS parser/matcher state only when needed. It reuses the existing tag tables and direct preorder scan. Escapes, Unicode identifiers, namespaces, compounds and lists retain the general selector path. Wasm packs pending commands and the following read into existing transfer storage for one exported call. It installs the read name after mutations, preserving fragment writes that replace input storage. This adds one private Wasm export; the opcode format, compiler defaults, heap/stack sizes and pool limits stay unchanged.

Fresh CPU profiles cover 12,000 full SVG-300 replays per backend with 100 µs sampling. Query traversal, parsing, serialization, allocation and wrapper work remain visible. Profiles guide the changes; their independent elapsed times are not paired speedups.

The plain-tag/lazy-CSS comparison uses ten fresh process pairs across the four XML inputs, combining the original five with a fixed five-pair extension. Native measures 0.988 raw / 0.929 filtered with 47/50 blocks retained; its control is 1.024/1.022 with 48/50 retained. Native incremental timing is inconclusive. Pool measures 1.049 with all 50 blocks retained; its control is 0.995/1.016 with 45/50 retained. Complementary isolated short trials on the two large XML inputs remain diagnostic: some controls drift materially, so they do not replace the paired results.

Adding the fused Wasm observation to the plain-tag variant measures 1.025× across five fresh pairs, with all 25 blocks retained. Its control is 0.982 with all blocks retained. Every comparison pair median improves, spanning 1.017–1.057. The native binary is byte-identical between these two variants. No sample is dropped because its speedup is unfavorable, and ratios are never normalized by controls.

HTML/MDN regressions compare the final candidate with `4d33ee8`, using separate persistent process pairs and the same six batches of two corpus replays, 40 warmups and five balanced blocks per pair. Native HTML starts with ten pairs; saved MDN and consumer start with five per backend. Pooled HTML starts with ten pairs. Initial native saved-MDN/consumer controls and the pooled-HTML control miss the 2% tolerance. Before examining further results, extend the first two by five pairs each and pooled HTML by ten; combine every original and extra result.

| Regression panel | Backend | Raw / filtered | Blocks retained | Control raw / filtered | Control blocks | Screen |
|---|---|---:|---:|---:|---:|---|
| Authored HTML | Native | 1.016 / 1.008 | 46/50 | 1.008 / 1.008 | 48/50 | Pass |
| Saved MDN | Native | 1.006 / 1.006 | 43/50 | 1.016 / 1.019 | 41/50 | Pass |
| Complete consumer | Native | 1.029 / 1.020 | 40/50 | 0.984 / 0.995 | 27/50 | Pass |
| Authored HTML | Pool | 1.038 / 1.043 | 86/100 | 0.987 / 0.986 | 83/100 | Pass |
| Saved MDN | Pool | 1.037 / 1.011 | 15/25 | 0.994 / 0.994 | 22/25 | Pass |
| Complete consumer | Pool | 0.987 / 1.009 | 19/25 | 1.005 / 1.018 | 15/25 | Pass |

All six panels meet the unchanged 2% comparison/control tolerances, with at least three retained blocks in at least three pairs. Pooled saved MDN has exactly three qualifying comparison pairs. Some individual process ratios still drift materially: native HTML comparison pair medians span 0.853–1.115. Passing this aggregate regression screen does not prove exactly zero slowdown. Original results remain preserved alongside the combined reports.

The final candidate uses the established five-block separate-process adoption screens. Individual XML cases use 80 warmups, six batches and eight replays per batch; the baseline is Cheerio 1.2.0 XML/htmlparser2. Every comparison and control block survives this replication, so raw and filtered medians agree.

| XML input | Backend | Median vs Cheerio XML | Minimum retained | Control median | 3× screen |
|---|---|---:|---:|---:|---|
| Sitemap, 120 entries | Native | 4.326 | 3.985 | 0.998 | Pass |
| Sitemap, 600 entries | Native | 5.126 | 3.427 | 1.013 | Pass |
| SVG, 120 groups | Native | 3.611 | 3.564 | 0.983 | Pass |
| SVG, 300 groups | Native | 3.522 | 3.303 | 1.022 | Pass |
| Sitemap, 120 entries | Pool | 3.691 | 3.478 | 1.054 | Pass |
| Sitemap, 600 entries | Pool | 4.494 | 4.203 | 1.014 | Pass |
| SVG, 120 groups | Pool | 3.287 | 2.874 | 0.970 | Retained block below target |
| SVG, 300 groups | Pool | 3.037 | 3.015 | 1.018 | Pass |

The pooled SVG-120 gate remains open despite its median exceeding three. Pooled SVG-300 clears the rule with little margin in this replication. Earlier failures and inconclusive results remain separate evidence; these results do not prove a universal per-input multiplier.

| Aggregate panel | Backend | Raw / filtered vs Cheerio | Blocks retained | Minimum retained | Control raw / filtered | Control blocks | 3× screen |
|---|---|---:|---:|---:|---:|---:|---|
| Explicit XML | Native | 3.633 / 3.633 | 5/5 | 3.363 | 0.996 / 0.996 | 5/5 | Pass |
| Synthetic HTML + XML | Native | 5.968 / 5.968 | 5/5 | 4.887 | 1.041 / 1.041 | 5/5 | Pass |
| Complete consumer | Native | 4.036 / 4.036 | 5/5 | 3.931 | 0.973 / 0.973 | 4/5 | Pass |
| Explicit XML | Pool | 3.819 / 3.819 | 5/5 | 3.334 | 1.004 / 1.004 | 5/5 | Pass |
| Synthetic HTML + XML | Pool | 4.944 / 4.944 | 5/5 | 4.708 | 0.983 / 0.983 | 5/5 | Pass |
| Complete consumer | Pool | 3.462 / 3.462 | 5/5 | 3.421 | 1.018 / 1.018 | 5/5 | Pass |

All six aggregate screens pass with the unchanged 10% control tolerance. The complete consumer panel retains its 19 scenarios and refreshed archive samples. Engine 0.9.1's sitemap path still uses its original HTML-mode load call; the explicit XML panel supplies XML parsing evidence.

The fastest-compatible HTML comparison uses Cheerio/slim on the mixed synthetic panel and the eight refreshed saved-MDN scenarios. Saved outputs are normalized outside timing, with exact ordered resource-event comparison. Every input matches; no sample is excluded for a parser/output mismatch. The comparison requires a demonstrated win over this baseline, rather than a separate 3× multiplier over the HTML htmlparser2 configuration.

Initial native/pool saved-page comparisons retain only one of five blocks, and the pooled saved-page control retains none. Pooled synthetic also retains one block. Before examining extension results, add one fixed five-block extension to saved comparisons/controls on both backends and pooled synthetic/control. Combine all original and extra blocks without changing probe decisions; retain full reports separately. Native synthetic keeps its original five blocks and matching aggregate control.

| Cheerio/slim panel | Backend | Raw / filtered | Blocks retained | Minimum retained | Control raw / filtered | Control blocks | Faster-baseline screen |
|---|---|---:|---:|---:|---:|---:|---|
| Synthetic HTML + XML | Native | 4.008 / 4.008 | 5/5 | 3.778 | 1.041 / 1.041 | 5/5 | Pass |
| Saved MDN | Native | 3.382 / 3.186 | 4/10 | 2.801 | 0.940 / 0.946 | 6/10 | Pass |
| Synthetic HTML + XML | Pool | 3.703 / 3.732 | 6/10 | 3.273 | 0.982 / 0.982 | 10/10 | Pass |
| Saved MDN | Pool | 3.212 / 3.212 | 4/10 | 3.116 | 0.996 / 1.006 | 5/10 | Pass |

All four screens pass their 10% control tolerance and minimum retention rules. Variability remains substantial: a retained native saved-page control block is 0.782. These scoped wins do not establish precise unconditional throughput or make htmlparser2 compatible with every generated/fragment consumer scenario.

The 718-case matrix passes: native 701 passes/17 skips, shared Wasm 703/15, fresh Wasm 704/14 and pooled Wasm 707/11. Native/pool also pass on Node 24. All 19 refreshed consumer outputs and ordered events match on all four backends. Types, rebuilt native ASan/UBSan with leak detection, refreshed-corpus lifecycle checks and the fixed authored 2,430-lifetime budgets pass. Allocation-failure injection, broader fuzzing and production traffic weighting remain outside these checks.

The expanded stack diagnostic adds the four sitemap/SVG replays to deep HTML/XML/template trees, bounded selector nesting and the eight restored MDN samples. It instruments all 120 stack-pointer writes in a separate build and runs 36 workloads with two sentinel patterns. Every pointer restores; only the expected bounded-selector cases return unsupported errors. Maximum observed pointer depth is 6,256 bytes and written watermark is 6,200 bytes. Each ordinary sitemap/SVG replay reaches 48 bytes of pointer depth. These measurements exclude the engine machine stack and do not prove a worst-case bound; this checkpoint retains the 64 KiB reservation. Release Wasm still has zero imports and no diagnostic exports.

## Audited stack reduction and Wasm view refresh

The follow-up after `7bdfdfc` sets the default Wasm stack to **32 KiB**, keeping 1 MiB initial memory, the 16 KiB transfer area, O3/ThinLTO and the existing target features. The [recursion audit](stack.md) reviews the facade, kernel, reachable Lexbor code and linked libc, including indirect dispatch. Expanded diagnostics cover 48 workloads with two sentinel patterns under O3/ThinLTO and kernel O2 without LTO (Lexbor remains O3). Both reach 6,256 bytes of pointer depth and 6,200 bytes written; every pointer restores. The remaining 5.2× observed headroom is a measured margin, not a worst-case proof. Native uses its existing process stack.

Fresh 100 µs CPU profiles of 12,000 SVG replays per size attribute about 2% of samples to the engine memory-buffer getter, chiefly beneath the binding's view-refresh helper. The helper now checks the existing byte view's length: growth detaches the non-shared buffer, reducing that length to zero and triggering a refresh. This detects growth by other documents in the global heap without another cache or allocation. The candidate profile no longer samples the getter beneath this helper. Independent profiler elapsed times are not used as speedups.

Before changing the stack, the view-only candidate measures 1.033× over `7bdfdfc` across five fixed process pairs and all four XML inputs, retaining all 25 balanced blocks. Its identical-code control is 1.010×. Each comparison pair median improves, ranging from 1.015 to 1.092; control pair medians range from 0.956 to 1.143. This is a modest incremental result with material process variability.

The combined candidate's HTML regression screens use five fixed persistent process pairs, five balanced blocks per pair, 40 warmups and six batches of two complete corpus replays. All comparison/control blocks survive the unchanged independent probe threshold of 1.5, so raw and filtered medians agree. Ratios are not normalized by controls.

| Pooled Wasm regression panel vs `7bdfdfc` | Median | Control median | Comparison / control blocks | 2% screen |
|---|---:|---:|---:|---|
| Authored HTML | 1.003 | 0.995 | 25/25 / 25/25 | Pass |
| Saved MDN | 1.006 | 1.007 | 25/25 / 25/25 | Pass |
| Complete consumer | 1.014 | 0.998 | 25/25 / 25/25 | Pass |

All five pairs qualify for each panel. One authored-HTML comparison block is 0.878; the median screen does not establish zero slowdown in every window. Native code, facade and artifact are unchanged, so the preceding native regression results remain applicable.

Absolute adoption screens use five balanced fresh-process blocks, six timed batches, the same independent probe filter and matching candidate controls. Individual XML uses 80 warmups and eight replays per batch; aggregate panels use 40 warmups and two complete corpus replays per batch. Every comparison/control block survives, and all raw/filtered medians agree.

| Pooled Wasm panel | Median vs current Cheerio | Minimum retained | Control median | 3× screen |
|---|---:|---:|---:|---|
| Sitemap, 120 entries | 3.912 | 3.569 | 1.019 | Pass |
| Sitemap, 600 entries | 4.663 | 4.560 | 1.040 | Pass |
| SVG, 120 groups | 3.298 | 3.061 | 0.986 | Pass |
| SVG, 300 groups | 3.122 | 3.029 | 1.013 | Pass |
| Explicit XML aggregate | 3.836 | 3.655 | 1.021 | Pass |
| Synthetic HTML + XML | 5.137 | 4.923 | 1.003 | Pass |
| Complete consumer | 3.530 | 3.458 | 1.023 | Pass |

The explicit XML baseline is Cheerio 1.2.0 XML/htmlparser2. Both pooled SVG sizes now clear the strict per-input screen, with little margin at the large size. Native's unchanged implementation cleared all four individual XML screens in the preceding checkpoint. Earlier failed blocks remain evidence of variability; these scoped passes do not establish a universal multiplier or replace production traffic weighting. The restored corpus and all 19 consumer scenarios are unchanged.

The fastest-compatible HTML baseline is also rechecked with Cheerio/slim. The mixed synthetic panel measures 3.962×, minimum retained 3.933×, with a 1.003 control. The eight saved-MDN scenarios measure 2.944×, minimum 2.906×, with a 1.014 control. Every comparison/control block survives, and raw/filtered medians agree. Both pass the required demonstrated-win screen (>1×, not a separate 3× HTML/htmlparser2 gate). Saved outputs match after normalization outside timing, with exact ordered resource events. This fixed run requires no extension or changed filter.

The 718-case suite passes on all three Wasm heaps under Node 22: shared 703 passes/15 skips, fresh 704/14, pool 707/11. Pool also passes on Node 24. All 19 refreshed consumer outputs and ordered events match on each heap policy. The authored 2,430-lifetime budget panel and separate restored-corpus lifecycle diagnostics pass. Native C and declarations are unchanged; the previous native sanitizer and type checks remain applicable. Release Wasm has zero imports and no diagnostic exports. See [memory results](memory.md#audited-32-kib-stack-and-view-refresh) for the reduced fresh/pool capacity and unchanged shared-heap high-water mark.

## Wasm-first investigation after `2eef7b6`

Pooled Wasm is the primary optimization target in this completed investigation.
The best-effort milestones are 6× native on the fixed mixed synthetic corpus and
4.5× pooled Wasm on the 19-scenario consumer corpus. Selected medians reach
5.80× and 4.62× respectively. The investigation continued through algorithm,
memory, libc, compiler, post-link and private-field experiments; it did not stop
at a favorable multiplier. Final native regression confirmations pass with
narrow margins and documented earlier failures. Production adoption remains open.

Input identities and weights stay fixed, using the refreshed eight-page MDN
corpus. Each fresh process runs one implementation; starting positions rotate and
each order is mirrored. Synthetic and saved-page panels use six balanced blocks,
and the consumer panel uses five. Each child performs 40 whole-corpus warmups
and six batches of two complete replays. Native and pooled identical-code controls
share the blocks. The independent probe max/min cutoff stays 1.5. All raw samples
remain available, with no ratio-based rejection, control normalization, or timing
overlap with builds, tests or profilers.

### Direct selected-release comparison

These Node 22.22.2 results compare the selected LLVM code and eight-slot pool
directly with Cheerio 1.2.0. They are not products of experimental speedups.
Ratios above one favor GroveDOM. The minimum is the smallest retained balanced
block; a slash separates raw and filtered medians when they differ.

| Panel | Backend | Median vs current Cheerio | Minimum | Identical-code control | Blocks |
|---|---|---:|---:|---:|---:|
| Mixed synthetic HTML/XML | Native | 5.804× | 5.309× | 1.029 | 6/6 |
| Mixed synthetic HTML/XML | Pooled Wasm | 5.400× | 5.239× | 0.982 | 6/6 |
| Complete consumer, 19 scenarios | Native | 4.920× | 4.124× | 1.008 | 5/5 |
| Complete consumer, 19 scenarios | Pooled Wasm | 4.621× | 3.848× | 0.995 | 5/5 |
| Saved MDN, eight pages | Native | 5.480× / 5.500× | 5.365× | 1.004 / 1.011 | 5/6 |
| Saved MDN, eight pages | Pooled Wasm | 5.102× / 5.055× | 4.957× | 1.026 / 1.026 | 5/6 |

All six rows clear the established aggregate 3× rule and 10% adoption-control
tolerance. That tolerance is distinct from the 2% regression checks below.
The pooled consumer median reaches the best-effort 4.5× milestone, while its
minimum remains below 4.5×. Its identical-code duplicate measures 4.625×.
Native synthetic remains below 6×, including its 5.979× duplicate. Duplicates
are controls, not replacements for the selected result.

The consumer replay includes actual transforms, bindings, disposal, URL work and
async overhead, while excluding network and disk. It is not a whole-crawl speedup.
Native remains slightly faster than pooled Wasm in these direct panels.

| Compatible Cheerio/slim baseline | Native raw / filtered | Pooled Wasm raw / filtered | Native / pool minimum |
|---|---:|---:|---:|
| Mixed synthetic | 4.343× / 4.343× | 4.006× / 4.006× | 3.942× / 3.941× |
| Saved MDN | 4.292× / 4.269× | 3.991× / 3.984× | 4.187× / 3.634× |

These ratios are recomputed from the same raw blocks in the requested direction,
not obtained by inverting an even-count median. They clear the required
faster-than-compatible-htmlparser2 rule. Synthetic output matches exactly.
The saved comparison checks normalized HTML and exact resource events outside
timing. The complete consumer panel still excludes slim because four authored
fragment/generated cases have incompatible behavior; that exclusion does not
weaken the output contract.

### Startup diagnostics

The same fresh processes record import and first-corpus wall times separately.
The following are unfiltered medians in milliseconds, before steady-state
warmup. Input/workload preparation and process startup are excluded.

| Panel | Implementation | Import | First complete corpus |
|---|---|---:|---:|
| Complete consumer | Current Cheerio | 357.7 | 482.0 |
| Complete consumer | Native | 6.6 | 105.1 |
| Complete consumer | Pooled Wasm | 9.2 | 146.6 |
| Saved MDN | Current Cheerio | 346.8 | 363.2 |
| Saved MDN | Cheerio/slim | 89.6 | 270.0 |
| Saved MDN | Native | 6.4 | 77.3 |
| Saved MDN | Pooled Wasm | 8.6 | 110.7 |

Import includes each package's actual loading work; first-corpus time includes
initial DOM instances and runtime warmup. Filesystem caches were not reset, and
package footprints/loading paths differ. These are scoped startup diagnostics,
not portable cold-start multipliers or isolated Wasm compilation measurements.

### Retained changes and rejected candidates

Template-query restarts and selector matching were larger initial costs than
libc. Short-list guards repeat at about 1.12× consumer improvement over the
corrected source baseline. Attribute-presence guards, a lazy 256-byte class/ID
Bloom summary and compaction of possible branches improve that screen further.
The compact combination measures 1.127× versus short guards alone, with a 0.998
control. Those incremental ratios remain diagnostic; the direct table above
measures the final combination.

| Experiment | Result and decision |
|---|---|
| Short template/attribute guards and compact possible branches | Repeated consumer gain; retain the bounded algorithm |
| Lazy document class/ID summary | Retain definite-miss rejection, conservative invalidation and detached-scope bypass; pure tag/attribute lists avoid constructing it |
| Per-node class signature | No advantage over simpler guards; reject extra per-node state/work |
| Bulk-only libc memory shadows | Synthetic slowdown and consumer parity; reject |
| Scalar copies/fills through 16 bytes, bulk above | Retain the bounded Wasm-only helpers |
| Recompile dependency with bulk-memory enabled | Small inconsistent gain; no new default flags |
| Command-view cache and forced writer inlining | Initial synthetic gain disappears in the fixed repeat; retain original code |
| Handwritten SIMD memory helpers, alone and with cache/inlining | No repeatable gain beyond control drift across XML/synthetic/consumer; no SIMD default or dependency fork |
| Binaryen 133 O3/O4/Oz and aggressive inlining | Mixed results and larger binaries; aggressive-inline output identical to O4 |
| Final Binaryen O3 follow-up | XML 1.023×, synthetic 1.033×, consumer 1.008×; controls 1.000/1.016/0.996 and broad spread; no default post-link pass |
| Skip inactive-summary invalidation checks | No repeatable gain; reject the extra branch |
| XML delimiter loops replaced with libc memchr | Mixed native results and pooled regressions; reject |
| Native parser-mode scope and flag placement | Three isolated variants pass behavior tests but show no reliable benefit; retain the reviewed layout |
| Invalidate selector summary once per command | Focused tests pass, but native HTML slows in the controlled screen; retain per-node invalidation |
| Compact document booleans | Restore an unchanged shared-heap plateau assertion; retain, without an incremental timing claim |
| Eight idle pool slots under the existing byte cap | Remove recurring consumer instantiation with modest extra retention; retain |
| Ordinary string/symbol fields and WeakMaps | No worthwhile overall gain preserving the current representation; retain private fields |

The SIMD experiment uses explicit intrinsics in GroveDOM-owned helpers. Scalar
and SIMD helpers pass direct byte checks over short/large sizes, alignments,
overlap where applicable, zero lengths and end-of-memory boundaries, plus full
suites and template-focused fuzzing. The selected release keeps zero imports and
the existing linked feature target. Binaryen adds no mandatory build dependency.
See [the implementation rationale](research.md#wasm-first-selector-and-libc-investigation)
and [linked-feature audit](research.md#linked-wasm-compatibility).

The final pooled consumer CPU profile assigns about 42.5% of samples to Wasm,
3.1% to linked libc and 7.0% to selection creation. Query scans/matching, wrappers,
parsing/string handling, consumer URL/async work and GC remain distributed costs.
Profile shares and independent profiler elapsed times are not paired speedups.
A broad DOM index or wrapper redesign would add invalidation, identity and
lifetime complexity without a demonstrated benefit from the smaller experiments.

### Pool reuse and memory tradeoff

Across 40 complete consumer replays, four idle slots create 124 instances;
eight slots create five in total and eliminate three recurring creations per
replay after warmup. Idle capacity rises from 8 to 9.125 MiB. The byte cap remains
16 MiB, and both configurations trim to zero.

A fixed comparison and repeat retain eight of twelve balanced blocks. The
four/eight ratio is 1.053 raw / 1.056 filtered, with a 0.984 four/four control.
The retained range is 0.976–1.078, so no universal gain is claimed. The authored
lifetime budget's pooled peak rises from 21.6875 to 24.4375 MiB, still below its
unchanged 32 MiB ceiling. See [the complete memory results](memory.md#wasm-first-allocation-and-lifetime-recheck).

### XML case and aggregate screens

These screens use the selected kernel/facade before the idle-slot-only change.
The single-document XML replays do not reach the former pool limit. Each case
uses five mirrored blocks, 80 warmups, six batches and eight replays per batch,
with native/pool controls in the same rotation. The reference is Cheerio
XML/htmlparser2.

| XML input | Backend | Raw / filtered median | Minimum retained | Control raw / filtered | Blocks |
|---|---|---:|---:|---:|---:|
| Sitemap, 120 entries | Native | 4.303× / 4.303× | 4.019× | 1.002 / 1.002 | 5/5 |
| Sitemap, 600 entries | Native | 4.886× / 4.886× | 3.847× | 0.974 / 0.974 | 5/5 |
| SVG, 120 groups | Native | 3.665× / 3.665× | 3.424× | 1.002 / 1.002 | 5/5 |
| SVG, 300 groups | Native | 3.514× / 3.524× | 3.487× | 0.988 / 1.011 | 4/5 |
| Sitemap, 120 entries | Pooled Wasm | 4.037× / 4.037× | 3.506× | 0.956 / 0.956 | 5/5 |
| Sitemap, 600 entries | Pooled Wasm | 4.752× / 4.752× | 4.718× | 0.984 / 0.984 | 5/5 |
| SVG, 120 groups | Pooled Wasm | 3.172× / 3.172× | 3.010× | 0.984 / 0.984 | 5/5 |
| SVG, 300 groups | Pooled Wasm | 3.266× / 3.391× | 3.014× | 0.962 / 0.960 | 4/5 |

All eight rows pass the strict 3× case rule, including every retained minimum and
the 10% control tolerance. Pooled SVG margins are narrow. An earlier candidate's
2.904× small-SVG block and its failed case result remain preserved; this later
pass does not erase that replication.

The XML aggregate uses the initial five blocks plus a fixed five-block extension,
retaining five of ten. Native measures 4.257× raw / 4.437× filtered, minimum
3.905×, with control 0.907 / 0.921. Pool measures 4.652× / 4.656×, minimum
4.190×, with control 1.058 / 1.074. Both pass the aggregate 3× and 10% control rules.
The native control is close to that tolerance boundary and is not a 2% control.

### Paired regression checks and native confirmations

These compare with `2eef7b6` using separate persistent processes: five fresh
process pairs, five balanced blocks per pair, 40 warmups and six batches of two
whole-corpus replays. The selected kernel's four-slot pool is used here; the
idle-slot comparison is reported separately above. Native HTML/XML include a
fixed additional five pairs. Ratios above one favor the candidate. A pass needs
both raw/filtered comparison medians at least 0.98, both controls within
0.98–1.02, and at least three qualifying pairs with three retained blocks.

| Panel | Backend | Raw / filtered ratio | Comparison blocks | Control raw / filtered | Control blocks | 2% screen |
|---|---|---:|---:|---:|---:|---|
| Authored HTML | Native | 0.966 / 0.956 | 39/50 | 1.011 / 1.007 | 35/50 | Fails |
| Authored HTML | Pool | 1.014 / 1.020 | 24/25 | 0.988 / 0.988 | 25/25 | Pass |
| Four XML inputs | Native | 1.043 / 1.025 | 40/50 | 1.032 / 1.054 | 41/50 | Inconclusive control |
| Four XML inputs | Pool | 1.012 / 1.012 | 25/25 | 1.009 / 1.009 | 25/25 | Pass |
| Saved MDN | Native | 1.280 / 1.280 | 25/25 | 0.996 / 0.996 | 25/25 | Pass |
| Saved MDN | Pool | 1.303 / 1.303 | 25/25 | 0.989 / 0.992 | 24/25 | Pass |
| Complete consumer | Native | 1.204 / 1.204 | 25/25 | 0.991 / 0.991 | 25/25 | Pass |
| Complete consumer | Pool | 1.240 / 1.240 | 25/25 | 0.982 / 0.982 | 25/25 | Pass |

The earlier intermediate candidate passed all eight panels. The selected
memory-layout correction's native HTML failure is not removed in favor of that
earlier result. Native phase instrumentation finds unchanged operation,
allocation, query and output counts; it does not establish elapsed-time parity.

A fixed longer diagnostic uses 400 warmups and twelve batches of eight complete
replays in five pairs of five blocks. Native HTML measures 1.009, but its control
is 1.021 raw / 0.978 filtered and fails the unchanged tolerance. XML measures
1.006 with a 0.925 control. Neither establishes a valid separate-process
non-regression result.

A complementary within-process check uses separate source/kernel and fixture
copies, five fresh processes, reversed imports in alternate processes, 200
warmups and twenty balanced blocks of eight whole-corpus replays. Ratios are
recomputed from raw milliseconds in the baseline/candidate direction.

| Native panel | Raw / filtered ratio | Comparison blocks | Control raw / filtered | Control blocks |
|---|---:|---:|---:|---:|
| Authored HTML | 1.001 / 0.997 | 93/100 | 1.004 / 1.002 | 94/100 |
| Four XML inputs | 1.001 / 1.001 | 95/100 | 1.001 / 0.997 | 94/100 |

Those medians meet the 2% tolerance, but the implementations share a JS heap.
They are complementary evidence, not replacements for the failed/inconclusive
separate-process screens. No unconditional native HTML/XML non-regression claim
is made. The scoped absolute 3× results and template-heavy consumer gains are
stronger than the evidence for small native differences.

The final extension of the original short protocol combines all thirty process
pairs per native comparison and control. HTML remains below the unchanged floor:
0.979900 raw / 0.975607 filtered, with control 1.015536 / 1.008265; comparison and
control retain 132/150 and 129/150 blocks. XML measures 1.024788 / 1.005312, with
control 1.031927 / 1.041046 and 135/150 versus 138/150 blocks. These are still a
failed HTML screen and an inconclusive XML control, not rounded passes.

A subsequent fixed eight-block screen puts baseline, selected release, a
command-invalidation candidate and an identical baseline control into the same
rotated/mirrored fresh-process blocks. The selected release measures HTML
0.994 / 1.005 with control 0.986 / 1.010 (7/8 blocks), and XML 1.060 with control
1.010 (8/8). The command-level candidate is rejected: selected/candidate HTML
is 0.930 / 0.937. No implementation change survives that screen.

The final confirmation retains separate persistent processes, but now includes
baseline, selected release and identical baseline control **within every block**.
Only one process executes a requested replay at a time. Starting positions rotate
over three variants and each order is mirrored; import order also rotates.
Inputs, outputs, compiler settings and the 1.5 independent-probe cutoff are
unchanged. Ratios are computed from raw milliseconds, first per balanced block,
then as a median per process triplet and a median across triplets. No ratio is
normalized by its control. The acceptance rule remains raw/filtered ratios at
least 0.98, both controls within 0.98–1.02, and at least three triplets with three
retained blocks.

| Native confirmation | Raw / filtered ratio | Control raw / filtered | Retained blocks | Qualifying triplets |
|---|---:|---:|---:|---:|
| Authored HTML, 18 triplets | 0.990863 / 0.990863 | 0.992299 / 0.992299 | 107/108 | 18/18 |
| Four XML inputs, longer warmup, 12 triplets | 0.994318 / 0.981486 | 0.991485 / 0.999377 | 55/72 | 9/12 |

HTML uses six blocks per triplet, 40 whole-corpus warmups and six batches of two
replays. The initial XML confirmation uses the same settings for eighteen
triplets: ratio 1.007297 and control 0.970040 / 0.970970, with 97/108 blocks.
A predeclared 42-triplet extension combines all sixty: ratio 1.001437 / 1.012116,
control 0.978513 / 0.979462, 330/360 blocks and 58 qualifying triplets. Its control
still fails; all samples remain in the record.

The separate longer-warmup XML confirmation uses 1,000 whole-corpus warmups,
24 batches of eight replays and six blocks per triplet. It addresses variation
in the short samples without changing the corpus or threshold. It passes, but
the filtered ratio has only 0.001486 headroom above the floor and seventeen
blocks fail the probe filter. The longer protocol is not combined with the
short protocol. Together with the six passing panels above, these confirmations
close this investigation's scoped regression checks. They do not erase earlier
failures or establish unconditional native parity. Logical-CPU activity selection
also does not account for sibling-thread load or guarantee an idle physical core.

### Private-field comparison

All three private fields are replaced together in isolated facade variants:
plain enumerable string keys, non-enumerable string keys, module-local symbols,
and WeakMaps. Each uses the same selected kernels and eight-slot pool.
A six-variant screen, including a byte-identical private-field control, runs all
three panels on native/pool in separate processes: 432 processes and 36 mirrored
blocks, with 24 retained. Several controls drift, and no overall winner emerges.

A fixed complementary repeat runs two fresh processes on each of Node 22.22.2
and 24.18.0 for native/pool, reversing imports in the second. Every variant has
separate facade, fixture and consumer-transform modules; an assertion checks
that each adapter captured the intended facade. Each panel uses 40 warmups and
twelve rotated/mirrored blocks of two complete replays per batch. A CPU is chosen
independently before each process. All 288 blocks survive the unchanged probe
filter. The following consumer ratios compare private fields with each
alternative; raw and filtered medians agree.

| Runtime / backend | Enumerable string | Non-enumerable string | Symbol | WeakMap | Private/private control |
|---|---:|---:|---:|---:|---:|
| Node 22 / pool | 1.006 | 0.944 | 1.001 | 0.918 | 0.995 |
| Node 22 / native | 1.015 | 0.949 | 1.003 | 0.944 | 0.998 |
| Node 24 / pool | 1.017 | 0.939 | 1.007 | 0.943 | 0.961 |
| Node 24 / native | 1.012 | 0.955 | 1.000 | 0.940 | 0.996 |

Symbols are approximately at parity on consumer work. Non-enumerable strings
and WeakMaps are slower. The Node 24 pooled consumer control fails the 2% rule;
its row does not establish a precise incremental multiplier. Synthetic/XML
results are mixed, including failed controls and large individual-block spreads.
The apparent native XML and some Node 24 gains are not treated as established.
The short repeat shares a JS heap and does not replace fresh-process gates.

Enumerable string keys change object enumeration/copying and cause worker
structured-clone failures. Non-enumerable strings, symbols and WeakMaps pass the
applicable existing native/pool suites; reflection checks additionally show that
the property variants expose metadata and recognize prototype-forged handles.
WeakMaps preserve opaque ownership but add allocation/lookup work. Private
fields remain. This evaluates full construction, use and disposal costs without
assuming private checks are free or that faster isolated property access wins
the workload.

### Validation and readiness

The selected 726-case matrix passes: native 709/17 skips, shared Wasm 711/15,
fresh Wasm 712/14 and pooled Wasm 715/11. Native/pool also pass Node 24, and public
types pass. Native ASan/UBSan with leak detection and the three seeded fuzz modes
are clean. The full validation sequence covers 18,000 fuzz case executions,
including the eight-slot pool repeat. All 19 consumer outputs/events match on
the four backends.

The unchanged authored 2,430-lifetime budgets pass on every backend. Separate
saved-corpus lifecycle checks are diagnostics, not authored-budget passes.
The selected stack diagnostic covers 48 workloads with two patterns and 122
instrumented writes: maximum pointer depth 6,256 bytes, written watermark
6,200 bytes, all pointers restored. It does not measure the engine machine stack
or prove a universal bound.

The selected source matches its promoted artifacts. Public rebuilds reproduce
Wasm executable sections and native executable/data sections; whole-file
differences are metadata/symbol information. Release Wasm has zero imports and
no diagnostic exports. Compiler defaults, initial memory, stack and scratch
sizes remain unchanged; only the idle-slot default increases to eight.

This completes the bounded optimization investigation and candidate review.
The best-effort native 6× milestone is unmet. Final regression confirmations pass,
with a narrow native XML margin and earlier failed/inconclusive evidence retained.
Production traffic weights, broader failure testing and shipping-platform/backend
selection remain adoption work.
