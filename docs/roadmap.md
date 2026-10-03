# Implementation roadmap

## Current state

The XML pass after `8c785fb` adds bounded document-owned name reuse and removes callback/binding overhead. Its callback-allocation follow-up passes the explicit XML aggregate at 3.775× raw / 3.511× filtered native and 3.331× pooled Wasm versus current Cheerio XML. Both pass the mixed synthetic aggregate; native also passes the refreshed complete-consumer aggregate. Saved-MDN regression screens pass on both backends, as do pooled authored-HTML and complete-consumer regression screens. Individual SVG targets, native authored-HTML/consumer regression controls and the refreshed pooled consumer adoption screen remain open. See [the results and limits](benchmarks.md#xml-callback-allocation-follow-up). Compiler, heap and threading defaults are unchanged.

The repository contains a shared C/Lexbor kernel with Linux Node-API and direct Wasm bindings, a partial Cheerio-shaped ESM facade, package metadata, truthful TypeScript declarations, differential/lifecycle tests, and a deterministic authored benchmark. See the [prototype guide and consumer inventory](prototype.md). Native direct and buffered execution share the same facade. This establishes a runnable diagnostic candidate; it does not select the production backend or complete consumer migration.

The selector pass after `3fd1609` reaches a [scoped performance checkpoint](benchmarks.md#whole-corpus-optimization-gate-after-3fd1609): both native and pooled Wasm clear the 3× current-Cheerio target on fixed synthetic and 19-case consumer panels on Node 22, with balanced process trials and identical-code controls. Necessary-atom filtering and simple-selector specialization improve the complete consumer replay by about 10% native and 14% pooled Wasm. The 700-case matrix and sustained memory budgets pass. Production traffic weights, cold-start evaluation and deployment remain separate adoption work; individual XML/nested/generated cases need not reach the aggregate multiplier.

Engine 0.9.1 parse/process/save/SVG/sitemap paths and representative MDN APIs have been inventoried. An isolated replay now runs actual consumer transforms, and the audited consumer TypeScript compiles against the facade. Full compatibility and memory gates, CI, prebuilt packages, and release remain open. Shared/fresh/pooled Wasm diagnostic comparisons are implemented; the production decision and Rust comparison remain open. Use existing toolchains for the current work; missing target support does not authorize installing new toolchains.

The deeper profiling pass adds optional phase/counter instrumentation, paired release comparisons, and compiler/LTO experiments. Short ASCII command encoding, private node metadata, and combined write/read boundaries reduce facade overhead; the measured build default is O3/ThinLTO. These are diagnostic improvements with successful-output and lifecycle coverage, not completion of the consumer adoption gate.

The Wasm feature sweep now covers bulk memory, SIMD, relaxed SIMD, tail calls, and nontrapping conversions. A [52-process short-run repeat](benchmarks.md#wasm-features-with-repeated-short-runs) still finds no repeatable overall win across Node 22/24 and both authored page sizes; controls retain order sensitivity. Extra target features remain opt-in. These experiments measure compiler-generated SIMD, not handwritten intrinsics. Any explicit SIMD work must stay in GroveDOM-owned code and target a measured bottleneck; do not fork or patch Lexbor for it. Release Wasm is import-free after removing the kernel's stdio formatting dependency, with a build check preventing accidental I/O imports.

The allocation pass shares selector plans/keys in one document-owned arena and reuses Wasm transfer views. Authored-replay backing allocation requests fall about 41–43%, with lower peak tracked memory. Initial timings under high host load remain provisional. A subsequent short-batch harness uses balanced orders, a fixed CPU-probe filter, raw results, identical-code controls, and fresh-process repetitions. It shows modest gains in some cases and mixed results elsewhere; precise universal speedups and full consumer performance/memory gates remain unproven.

The next pass measures Wasm stack-pointer changes and written-byte watermarks, reduces the stack reservation to 64 KiB and initial memory to 1 MiB, and shares 16 KiB of synchronous transfer scratch within each instance. Pending queues remain per-document. Cached memory views also decode returned strings without a temporary subarray. See the [measurements and their limits](benchmarks.md#wasm-stack-and-transfer-storage).

Feature expansion covers templates, relative query chains, collection helpers and the selected upstream method groups. Both backends implement XML for standalone SVG and sitemaps with the existing arenas and toolchains. Template-sensitive pseudos and the isolated engine adapter have since been added; [integration](integration.md) records the current replay and migration checks. Broader loading and unaudited raw-node/plugin behavior remain explicit gaps in the [compatibility inventory](compatibility.md). Full workload speed, general fragmentation bounds and release packaging remain open; scoped memory budgets are now tested.

## First implementation milestone

Establish the actual API surface and a deterministic baseline replay before choosing the implementation backend.

Follow the [toolchain requirements](research.md#minimal-toolchains-and-cross-compilation). Use a supported Node release. Wasm work uses the existing compiler/linker plus the approved runtime/build libraries. No further toolchain installation is implied.

1. Read README, design, benchmarks, and research.
2. Select and pin the consumer and engine versions used for the replay. Verify installed package resolution against the lockfile in an isolated benchmark checkout.
3. Inspect the engine's parse/process/save/SVG/sitemap paths and public lifecycle types. Record the public source or package revision used.
4. Inventory production Cheerio methods, options, raw node-field access, callbacks, and lifetime assumptions in the engine and MDN consumer.
5. Choose and hash a small representative corpus; preserve input/output contracts and deterministic resource responses.
6. Measure current Cheerio and the best semantically acceptable configurations of both Cheerio/parse5 and Cheerio/htmlparser2 on that replay.
7. Specify the first supported Cheerio-style API, parser defaults/options, safe failure handling, callback/flush order, node field behavior, XML strategy, and platform matrix. Node >=22.0.0 is decided; validate patched Node 22/24 and smoke-check the floor. Plan public type-only reuse of Cheerio declarations and compile representative consumer code with minimal migration edits.
8. Specify the agreed ownership policy for the prototypes: explicit idempotent `$.dispose()` at the engine's `finally` boundary, plus native owner finalization/shared-Wasm registry cleanup/per-document-Wasm host GC. Cover release-once control records, owner retention by selections, reentrant disposal, and native external-memory accounting.
9. Record allocation policies, peak/retained-memory budgets for the corpus, and the smallest required toolchain. Use Node scripts; no Python unless a required dependency has no reasonable alternative. Keep each call synchronous with no library-managed threads; support independent documents in caller-managed workers.

This milestone should yield reproducible baseline data and compatibility/ownership requirements, not a full replacement.

## Subsequent milestones

### Minimal vertical slice

Implement Cheerio-style `load`/`$`, selectors, attribute read/write, removal/insertion, serialization, and explicit disposal behind a small facade. Use real document/selection handles internally and lazy identity-preserving node wrappers where observed. Start with direct selection-level operations to establish costs and correctness. Establish document arenas/pools and reusable buffers at this stage, not as a late rewrite.

Include backend-appropriate GC fallback and native external-memory accounting in this slice. All release paths share the same idempotent cleanup; retained selections keep the owner alive until explicit disposal or collection of the whole ownership graph.

Compare a reviewed/patched Lexbor build against an arena-backed html5ever stack without assuming either wins. Keep implementation effort proportional: small diagnostic prototypes before full compatibility coverage.

### Ordered batching

Add a document-wide op stream, result handles, observations/flushes, and whole-selection operations. Use flat reused command/payload buffers with a small opcode table; no independent version, checksum, schema framework, or ABI compatibility layer. Cover aliasing, selection snapshots, retained removed nodes, async hook boundaries, partial failures, and scratch cleanup. Compare buffered and direct modes through the same Cheerio-style facade.

### Binding comparison

Measure direct Wasm and Node-API on the real facade, including string/selection transfer, large call loops, and cleanup. Consider writing command payloads directly into Wasm memory and transferring native output-buffer ownership where the API permits. Keep callback-driven behavior equivalent; default public output must survive document disposal.

For Wasm, compare shared, fresh per-document, and bounded pooled instances, reusing the compiled module. Include recurring instantiation cost, simultaneous live DOMs interleaved on one thread, nested DOMs, varied disposal order, huge-then-small documents, and backing memory retained by views/handles. Include a bounded idle-instance pool with no threads or scheduler. Record allocator holes/slack, live/reserved bytes, growth, peak RSS, and reclamation latency before selecting either memory model.

### Memory and migration acceptance

Trace allocations on real parse/query/mutate/serialize paths. Remove avoidable small hot-loop heap allocations, reuse mutation value capacity, bound caches, and reclaim transient result storage. Exercise leak/use-after-free checks and repeated lifecycles, including exceptions, retained detached nodes, disposed handles, and outputs. Test explicit release followed by GC, selections surviving `$`, callback-triggered disposal, native memory accounting, and cleanup registration without owner-retaining cycles. Keep fallback GC timing out of deterministic correctness assertions. Reject accumulating fragmentation or retained capacity beyond the agreed workload budgets.

Compile and replay representative consumer functions with only import/lifecycle edits. Reuse truthful Cheerio typedefs, preserve overloads and callbacks, and explicitly list unsupported raw-node/plugin/option behavior and any compatibility paths. Do not use type assertions to hide missing runtime behavior.

### Integration and gate

Add the downloader adapter and replay the real MDN transformations. Pass correctness, migration, and memory/lifetime checks, then require both ≥3× over current Cheerio and a measured win over the fastest compatible Cheerio/parse5 or Cheerio/htmlparser2 baseline. Include the glue and all fallback/lifecycle costs.

### Packaging

Choose one initial production kernel/binding based on speed, memory, and implementation/toolchain simplicity. Build/install/load-test the declared targets. Ship JS glue and kernel together on the same major.minor version, preferably as exact build pairs, with no stable internal ABI promise or protocol negotiation. Keep source compilation a developer/CI concern where prebuilt packages can serve consumers. Decide repository/package release layout and license before publishing.

## Consumer integration coverage

Audit lifecycle hooks, HTML transformations, compatibility tables, interactive examples, URL rewriting, SVG/sitemaps, and save behavior. Include their focused regressions in the replay. Record public source/package revisions and recheck dependency resolution when freezing the benchmark; keep developer checkout locations and installation histories out of committed reports.

The pass after accepted baseline `d29bb5f` implements an isolated engine/MDN replay and disposal adapter, template-aware `:has`/`:empty`, common Cheerio selector aliases and `:contains`, audited property/form corrections, and per-call XML serialization options. Profiling identified per-element selector restarts on template documents; ordinary selectors now scan subtrees and merge fragment matches in preorder. See [integration](integration.md), [compatibility](compatibility.md) and the latest [benchmark evidence](benchmarks.md).

Cross-document adoption remains deferred: the audited consumers transfer markup strings and independent resources, not nodes. `loadBuffer` is explicitly deferred. The performance/memory pass after `2c3c16e` expands replay to 19 matching cases, compiles 87 consumer TypeScript source files, adds sustained mixed-lifetime capacity budgets and reduces empty-result allocation traffic. See [memory](memory.md) and [benchmarks](benchmarks.md) for measured limits. Next adoption work is representative original-input coverage, allocation-failure testing, closing the full-workload speed gap, and packaging/backend selection. Success on selected large pages does not establish the full workload gate.

## Deliberately deferred

- Out-of-order execution and speculative optimizers.
- Internal parallel execution, library-managed worker pools, shared-document execution. Independent documents in caller-managed workers are supported.
- Machine-code JIT or dynamically generated Wasm selector modules.
- A general browser engine or JavaScript execution environment.
- Unrestricted compatibility with all Cheerio/domhandler internals.
- A stable internal ABI, independent bytecode version, checksums, or general protocol framework.
- A blanket native-over-Wasm decision based on compute speed alone.
- Full crawls for performance measurement before scoped replay exists.
