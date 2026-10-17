# Readiness and next work

Experimental 0.1.1 is published as a
[compatibility bug-fix patch](../CHANGELOG.md), with hosted release verification
complete. Pooled Wasm on Node is primary, native is separate and the browser
entry uses the same Wasm binary with async initialization.
[Compatibility](compatibility.md) defines supported,
best-effort and unsupported behavior; [testing](testing.md) records qualification.

## Current status

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
