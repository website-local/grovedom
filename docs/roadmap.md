# Readiness and next work

Experimental `0.1.0` is published; `0.1.1` is in development. The main package is
Wasm-first, native is separate, and the browser entry uses the same Wasm binary
with async initialization. [Compatibility](compatibility.md) defines supported,
best-effort and unsupported behavior; [testing](testing.md) tracks coverage.

## Current status

- The architecture refactor and compatibility follow-up passed scoped performance
  screens. Margins are narrow for XML/Node 24 and the selector workload.
- Stateful fuzzing found and fixed insertion-context differences. The quality
  fix's consumer screen passed; its insertion control remains inconclusive.
- Fragment reuse improves an authored bulk-insertion case. Consumer profiling
  points instead to repeated tag checks and attribute access. See
  [evidence and limits](benchmarks.md); none establishes production adoption.
- Hosted build/package checks passed Node 22.0.0 and maintained Node 22/24 on
  Linux, plus pooled Wasm on Node 24 Windows/macOS. Browser engines remain untested.

## Priorities

1. Optimize concrete consumer bottlenecks with short, predeclared comparisons;
   preserve callback order, retained handles and the primary pooled-Wasm path.
2. Broaden stateful fuzzing and parser/allocation-failure coverage. Current owned
   buffer fault tests do not establish universal upstream OOM recovery.
3. Validate original production inputs and workload weights with the application
   owner; saved-output replays are not a complete crawl distribution.
4. Run compatibility/demo cases in Chromium, Firefox and WebKit before promoting
   browser support from best-effort. Add native platforms when demand justifies
   their build, package and maintenance costs.
5. Configure npm trusted publishing after the token-based bootstrap; follow the
   [manual release workflow](releasing.md) for tested artifacts and provenance.

Avoid broad tuning campaigns, new schedulers/JITs and backend frameworks for noisy
micro-gains. Keep [dependency patches](../native/patches/README.md) minimal, pinned
and regression-tested. [Historical milestones](history/roadmap.md) remain separate
from current readiness.
