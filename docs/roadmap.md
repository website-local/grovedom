# Readiness and next work

Experimental 0.1.0 is published; 0.1.1 is prepared as a
[non-breaking patch](../CHANGELOG.md), pending hosted release verification.
Pooled Wasm on Node is
primary, native is separate and the browser entry uses the same Wasm binary with
async initialization. [Compatibility](compatibility.md) defines supported,
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
  plus pooled Wasm on Node 24 Windows/macOS. Actual browser engines remain untested.

## Priorities

1. Isolate concrete bottlenecks with fixed comparisons when new performance
   work is requested. Preserve callbacks, snapshots, handles and unfavorable
   evidence; avoid repeating broad campaigns to chase passing controls.
2. Broaden stateful fuzzing and parser/allocation-failure coverage. Current owned
   buffer tests do not prove universal upstream OOM recovery.
3. Validate production inputs and workload weights with the application owner;
   saved-output replays do not represent a complete crawl distribution.
4. Run compatibility/demo cases in Chromium, Firefox and WebKit before promoting
   browser support. Add native platforms when their demand justifies maintenance.
5. Configure npm trusted publishing and use the [manual release workflow](releasing.md)
   for tested artifacts and provenance.

Keep [dependency patches](../native/patches/README.md) minimal and regression-tested.
New schedulers, JITs or backend frameworks are not justified by current evidence.
[Historical milestones](history/roadmap.md) remain separate from current readiness.
