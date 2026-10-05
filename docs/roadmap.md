# Readiness and next work

The architectural direction is Wasm-first: the main `grovedom` package uses
pooled Wasm on Node, `grovedom-native` is separate, and browsers use an async ESM
entry with the same binary. Both packages are published at experimental 0.1.0.

## Implemented architecture

- Separate document, selection, node, operation and initialization ESM modules.
- Separate native lifecycle, allocation, node, query, mutation and serialization
  translation units with internal headers and hidden symbols.
- Explicit runtime initialization; baked build constants; no runtime environment
  or package-metadata checks.
- Development-only JS diagnostics, independent package assembly and browser demo.
- MIT project license and bundled third-party license/notice files in both packages.
- Supported/best-effort/unsupported compatibility status, differential tests,
  worker/lifecycle coverage, owned buffer failure injection and scoped replay.

## Remaining work

The compatibility-gap follow-up is implemented and replay-tested. Its bounded
performance investigation found and corrected redundant token scans/dispatch,
but final identical-code controls remain outside tolerance. A precise current
non-regression claim remains open; do not treat the historical refactor screen
as validation of these later changes. Keep any further checks short and tied to
a concrete regression concern.

The refactor's six-panel scoped performance screen is complete, including the
short confirmations after correcting inherited-affinity detection. XML/Node 24
has a narrow margin inside the 2% tolerance. Earlier inconclusive controls remain
preserved; this does not establish production adoption. See
[the screen](benchmarks.md#corrected-affinity-and-final-confirmation).

Hosted CI and package checks passed for the exact Node 22.0.0 floor, maintained
Node 22/24 on Linux, and Node 24 pooled Wasm on Windows/macOS.

1. Run the demo and compatibility cases in Chromium, Firefox and WebKit before
   promoting browser support from best-effort. Actual browser-engine execution
   remains untested.
2. Validate production input weights and original, unprocessed pages with the
   application owner. The deterministic nineteen-case replay is representative
   diagnostic evidence, not a production traffic distribution or complete crawl.
3. Broaden allocator-failure and fuzz coverage, particularly upstream parser
   exhaustion and unaudited raw-node/option behavior. Existing owned buffer
   failure tests do not establish universal OOM recovery.
4. Configure npm trusted publishing after the successful token-based bootstrap.
   [Manual release workflows](releasing.md) define the Wasm and Linux x64/glibc
   artifacts; future releases should use OIDC with the configured package owners.

Avoid another broad optimization campaign. Revisit performance for a concrete
integration bottleneck or reproducible regression, using the bounded short
protocol in [benchmarks](benchmarks.md). Do not add schedulers, JITs or an expanding
backend framework to pursue small noisy gains. Keep any
[dependency patches](../native/patches/README.md) minimal,
pinned, reproducible and covered by regressions.

[Historical roadmap](history/roadmap.md) records earlier milestones.
