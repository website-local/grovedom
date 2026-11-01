# Readiness and next work

Experimental **0.1.2 is published**; `main` targets **0.1.3 (unreleased)**.
Pooled Wasm on Node is primary, native is a separate package, and browsers use
the same Wasm binary with async initialization. The
[compatibility guide](compatibility.md) defines the supported contract.

## Current status

The 0.1.2 changes fix initialization reentrancy, insertion hangs, foreign-owner
queries, traversal occurrences, fragment coverage, failed-load cleanup and wide
forms. They also reduce unnecessary boundary calls, temporary selections and
retention. [Correctness and resource qualification](testing.md#current-qualification)
records the exact matrix, exclusions, sanitizer, fuzz and package checks.

Release 0.1.2 is published from `25faa49`, whose full CI workflow is reported
passing. Both npm packages and the hosted demo now serve 0.1.2. The development
version is 0.1.3, with direct facade state, selected allocation/loop improvements
and opt-in [`loadFast()` selections](compatibility.md#selection-modes). Both modes
share one implementation; complete consumer performance remains open in
`mdn-local`. Prior actual-browser results still apply to their named 0.1.1
checkpoint, and published-package engine qualification remains at 0.1.2.

Published-package engine checks passed on Node 22/24, including installed
declarations, both downloaders and all 16 ownership/pool cases per runtime.
The final engine quality commit `3a84caa` also passed 1,138 tests. The
[integration status](integration.md#engine-qualification) distinguishes this
completed qualification from the remaining MDN migration and adoption gates.

**Current full-scope non-regression and production adoption remain unverified.**
Targeted operations improve in scoped measurements, but incomplete panels,
control drift and unfavorable results prevent a broader claim. The completed
[performance evidence](benchmarks.md) remains separate from correctness checks.
Closed campaigns stay closed; the next measurements should qualify consumer
integration.

## Priorities

1. Continue in `mdn-local`: migrate to the current engine's explicit document
   ownership and lifecycle APIs, establish a Cheerio baseline, then compare
   original-input replay and complete-workload performance. Use published 0.1.2
   as the qualified integration baseline; evaluate the 0.1.3 changes and fast
   mode separately against the same required outputs and memory limits.
   Validate full locale archives and offline browser behavior at the adopted
   consumer revision. Keep Cheerio as default until the adoption gates pass;
   saved snapshots do not establish production weights or complete-crawl speed.
2. Extend actual-browser API and fallback checks beyond
   the selected correctness page. Firefox/Chromium results and exclusions remain
   documented; WebKit is unqualified, so browser support stays best-effort.
3. Broaden stateful fuzzing and allocation-failure coverage when a consumer need
   warrants that work. Owned-buffer tests do not prove recovery from every
   upstream or host allocation failure.
4. Start future optimization work from source analysis and profiles, then use a
   fixed comparison to confirm a concrete finding. Preserve callback order,
   snapshots, identity and unfavorable evidence.

Keep [dependency patches](../native/patches/README.md) small and regression-tested.
Additional native platforms depend on demand and maintenance capacity. Current
evidence does not justify new schedulers, JITs or backend frameworks.
[Historical milestones](history/roadmap.md) retain earlier decisions.
