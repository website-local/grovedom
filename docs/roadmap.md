# Implementation roadmap

## Current state

The repository contains the design, feature inventory, benchmark gates, and dependency research. No kernel, facade, integration, package metadata, CI, or release has been implemented.

## First implementation milestone

Establish the actual API surface and a deterministic baseline replay before choosing the implementation backend.

Follow the [toolchain requirements](research.md#minimal-toolchains-and-cross-compilation). Use a supported Node release and add Wasm libc/target support when starting the relevant Wasm prototype.

1. Read README, design, benchmarks, and research.
2. Select and pin the consumer and engine versions used for the replay. Verify installed package resolution against the lockfile in an isolated benchmark checkout.
3. Inspect the engine's parse/process/save/SVG/sitemap paths and public lifecycle types. Record the public source or package revision used.
4. Inventory production Cheerio methods, options, raw node-field access, callbacks, and lifetime assumptions in the engine and MDN consumer.
5. Choose and hash a small representative corpus; preserve input/output contracts and deterministic resource responses.
6. Measure current Cheerio and the best semantically acceptable configurations of both Cheerio/parse5 and Cheerio/htmlparser2 on that replay.
7. Specify the first supported Cheerio-style API, parser defaults/options, error timing, callback/flush order, node field behavior, XML strategy, and platform matrix. Node >=22.0.0 is decided; validate patched Node 22/24 and smoke-check the floor. Plan public type-only reuse of Cheerio declarations and compile representative consumer code with minimal migration edits.
8. Specify the agreed ownership policy for the prototypes: explicit idempotent `$.dispose()` at the engine's `finally` boundary, plus native owner finalization/shared-Wasm registry cleanup/per-document-Wasm host GC. Cover release-once control records, owner retention by selections, reentrant disposal, and native external-memory accounting.
9. Record allocation policies, peak/retained-memory budgets for the corpus, and the smallest required toolchain. Use Node scripts; no Python unless a required dependency has no reasonable alternative. Keep all prototypes single-threaded.

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

For Wasm, compare one global instance/heap with document arenas against one instance/heap per DOM, reusing the compiled module. Include recurring instantiation cost, simultaneous live DOMs interleaved on one thread, nested DOMs, varied disposal order, huge-then-small documents, and backing memory retained by views/handles. No instance pools or multithreading initially. Record allocator holes/slack, live/reserved bytes, growth, peak RSS, and reclamation latency before selecting either memory model.

### Memory and migration acceptance

Trace allocations on real parse/query/mutate/serialize paths. Remove avoidable small hot-loop heap allocations, reuse mutation value capacity, bound caches, and reclaim transient result storage. Exercise leak/use-after-free checks and repeated lifecycles, including exceptions, retained detached nodes, disposed handles, and outputs. Test explicit release followed by GC, selections surviving `$`, callback-triggered disposal, native memory accounting, and cleanup registration without owner-retaining cycles. Keep fallback GC timing out of deterministic correctness assertions. Reject accumulating fragmentation or retained capacity beyond the agreed workload budgets.

Compile and replay representative consumer functions with only import/lifecycle edits. Reuse truthful Cheerio typedefs, preserve overloads and callbacks, and explicitly list unsupported raw-node/plugin/option behavior and any compatibility paths. Do not use type assertions to hide missing runtime behavior.

### Integration and gate

Add the downloader adapter and replay the real MDN transformations. Pass correctness, migration, and memory/lifetime checks, then require both ≥3× over current Cheerio and a measured win over the fastest compatible Cheerio/parse5 or Cheerio/htmlparser2 baseline. Include the glue and all fallback/lifecycle costs.

### Packaging

Choose one initial production kernel/binding based on speed, memory, and implementation/toolchain simplicity. Build/install/load-test the declared targets. Ship JS glue and kernel together on the same major.minor version, preferably as exact build pairs, with no stable internal ABI promise or protocol negotiation. Keep source compilation a developer/CI concern where prebuilt packages can serve consumers. Decide repository/package release layout and license before publishing.

## Consumer integration coverage

Audit lifecycle hooks, HTML transformations, compatibility tables, interactive examples, URL rewriting, SVG/sitemaps, and save behavior. Include their focused regressions in the replay. Record public source/package revisions and recheck dependency resolution when freezing the benchmark; keep developer checkout locations and installation histories out of committed reports.

## Deliberately deferred

- Out-of-order execution and speculative optimizers.
- Multithreading, worker pools, shared-memory execution, and instance-pool scheduling.
- Machine-code JIT or dynamically generated Wasm selector modules.
- A general browser engine or JavaScript execution environment.
- Unrestricted compatibility with all Cheerio/domhandler internals.
- A stable internal ABI, independent bytecode version, checksums, or general protocol framework.
- A blanket native-over-Wasm decision based on compute speed alone.
- Full crawls for performance measurement before scoped replay exists.
