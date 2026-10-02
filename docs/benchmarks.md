# Benchmark targets and adoption gates

## Accepted performance requirements

Adoption requires **at least 3× faster elapsed time for the complete Cheerio DOM workload, including binding overhead**.

```text
speedup = baseline elapsed time / candidate elapsed time
PASS requires speedup >= 3.0
equivalently: candidate time <= baseline time / 3
```

This requirement concerns the DOM workload, not whole-download wall time. Network latency, archive packaging, and disk I/O can dominate a full crawl and are not the primary gate.

The gate has not been met or tested yet. Boundary microbenchmarks and upstream parser benchmarks cannot pass it.

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

For Node-API and both Wasm models, replay repeated parse/query/mutate/serialize/dispose cycles. Include:

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

The Wasm matrix is one instance/global heap with document arenas versus one instance/heap per document, sharing only the compiled module. Hold kernel, workload, and semantics constant. Include sequential, interleaved, and nested documents without introducing threads. Track live allocations, allocated capacity, free-block sizes, unusable holes, per-instance page slack, JS references, linear-memory pages, RSS, and disposal/reclamation latency. Show when global memory is reusable but cannot shrink, and when per-document backing memory is awaiting host GC.

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
