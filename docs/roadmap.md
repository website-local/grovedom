# Readiness and next work

The architectural direction is Wasm-first: the main `grovedom` package uses
pooled Wasm on Node, `grovedom-native` is separate, and browsers use an async ESM
entry with the same binary. The package remains experimental and unpublished.

## Implemented architecture

- Separate document, selection, node, operation and initialization ESM modules.
- Separate native lifecycle, allocation, node, query, mutation and serialization
  translation units with internal headers and hidden symbols.
- Explicit runtime initialization; baked build constants; no runtime environment
  or package-metadata checks.
- Development-only JS diagnostics, independent package assembly and browser demo.
- Supported/best-effort/unsupported compatibility status, differential tests,
  worker/lifecycle coverage, owned buffer failure injection and scoped replay.

## Remaining release gates

The refactor's six-panel scoped performance screen is complete, including the
short confirmations after correcting inherited-affinity detection. XML/Node 24
has a narrow margin inside the 2% tolerance. Earlier inconclusive controls remain
preserved; this does not establish production adoption. See
[the screen](benchmarks.md#corrected-affinity-and-final-confirmation).

1. Test the exact Node 22.0.0 floor and intended OS/architecture artifacts. Current
   execution covers maintained Node 22/24 and Linux; do not infer other platforms.
2. Run the demo and compatibility cases in Chromium, Firefox and WebKit before
   promoting browser support from best-effort. No browser engine is installed in
   the current validation environment.
3. Validate production input weights and original, unprocessed pages with the
   application owner. The deterministic nineteen-case replay is representative
   diagnostic evidence, not a production traffic distribution or complete crawl.
4. Broaden allocator-failure and fuzz coverage, particularly upstream parser
   exhaustion and unaudited raw-node/option behavior. Existing owned buffer
   failure tests do not establish universal OOM recovery.
5. Decide release licensing, packaging/platform policy and deployment ownership.
   Local package assembly does not authorize publication or consumer migration.

Avoid another broad optimization campaign. Revisit performance for a concrete
integration bottleneck or reproducible regression, using the bounded short
protocol in [benchmarks](benchmarks.md). Do not add schedulers, JITs, dependency
forks or an expanding backend framework to pursue small noisy gains.

[Historical roadmap](history/roadmap.md) records earlier milestones.
