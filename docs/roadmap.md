# Readiness and next work

Experimental 0.1.1 is published as a
[compatibility bug-fix patch](../CHANGELOG.md#011), with hosted release verification
complete. Development on `main` targets **0.1.2 (unreleased)**.
Pooled Wasm on Node is primary, native is separate and the browser
entry uses the same Wasm binary with async initialization.
[Compatibility](compatibility.md) defines supported,
best-effort and unsupported behavior; [testing](testing.md) records qualification.

## Current status

- Four read-path improvements avoid unnecessary ID transfers, child selections,
  singleton views and repeated wrapping traversals. The 2,505-case native/pool
  Node 22/24 matrix, focused other heaps, declarations and offline packages pass.
  A fixed server confirmation favors the targeted operations but stops at
  711/1,024 blocks; controls and an unfavorable native HTML600 result limit
  broader conclusions. The preceding full server run completes 120/122
  comparisons at `c807bdb`, with HTML600 and the frozen consumer near parity
  with 0.1.1. [Complete evidence](history/read-performance.md) preserves both
  protocols. Current full-scope non-regression and production adoption remain open.
- The 0.1.2 correctness review fixes repeated-insertion hangs, foreign-owner
  `.add()` queries, duplicate traversal occurrences and single-select null values.
  Its follow-up fixes fragment query coverage, failed-load cleanup, raw child
  retention and wide-form serialization. The API follow-up batches static `until`
  traversals, fixes callback visits after tree edits, and reduces attribute,
  containment and transport overhead. The 2,488-case local matrix, sanitizer,
  seeded fuzz, preserved consumer replays, offline packages and four 120-cycle
  memory budgets pass. CI at `71db6d3` and `654c9b9` is also
  [reported as passing](testing.md#reported-012-ci-passes). Their
  [Wasm summaries](benchmarks.md#012-reported-ci-runs) compare each candidate
  with published 0.1.1; SVG remains below 3× Cheerio and XML controls limit small
  gain claims. The sixteen local API timing panels yield one scoped
  non-regression pass and fifteen inconclusive results; a separate server run
  stops during preflight. Full-scope non-regression remains unverified. Earlier
  host-stopped panels and the two-pass insertion review remain documented.
  [Qualification and limits](testing.md) remain explicit.
- The bounded performance investigation is complete. It retains the Wasm HTML
  span writer, correctness fixes and XML regression tests. Native keeps its
  preceding writer; later isolated experiments supply no supported primary gain.
- The selected writer has scoped HTML600 and seeded-corpus p90/p95 improvements.
  Real-page timing remains incomplete. The selected combination's original
  twenty-panel screen has six median passes, one failure and thirteen
  inconclusive results. **Full-scope non-regression and production adoption
  remain unverified.** [Evidence](benchmarks.md) preserves these distinctions.
- Correctness, sanitizer, consumer, fuzz and resource checks pass for their
  documented scope. Fixed memory budgets and custom-corpus diagnostics are
  separate; malformed-input exclusions remain explicit.
- Hosted package checks cover Node 22.0.0 and maintained Node 22/24 on Linux,
  plus pooled Wasm on Node 24 Windows/macOS. Reported Firefox 150 and Chromium 140
  [demo results](benchmarks.md#011-release-measurements) cover four authored
  workloads; their ratios differ materially. Their separate
  [correctness-page runs](testing.md#reported-browser-runs) each pass 810 cases
  with 35 documented skips and no failures. WebKit and broader browser API
  coverage remain unqualified; the package retains its experimental status.

## Priorities

1. Validate the published package on representative production inputs and
   workload weights with the application owner. Check output, resource lifetimes
   and complete-workload performance against the fastest compatible Cheerio
   configuration; saved-output replays do not represent a complete crawl distribution.
2. Extend browser public-API coverage beyond the selected correctness page and
   qualify WebKit before broadening browser support. Preserve the documented
   Firefox/Chromium results and exclusions.
3. Broaden stateful fuzzing and parser/allocation-failure coverage. Current owned
   buffer tests do not prove universal upstream OOM recovery.
4. Isolate concrete bottlenecks with fixed comparisons when new performance
   work is requested. Preserve callbacks, snapshots, handles and unfavorable
   evidence; avoid repeating broad campaigns to chase passing controls.
5. Use the [manual release workflow](releasing.md) for future tested artifacts
   and provenance; maintain npm trusted publishing or the configured token path.
   Add native platforms when their demand justifies maintenance.

Keep [dependency patches](../native/patches/README.md) minimal and regression-tested.
New schedulers, JITs or backend frameworks are not justified by current evidence.
[Historical milestones](history/roadmap.md) remain separate from current readiness.
