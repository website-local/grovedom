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
passing. Both npm packages and the hosted demo now serve 0.1.2. Development
continues at 0.1.3; prior actual-browser results still apply to their named 0.1.1
checkpoint. Published-package consumer qualification is the next step.

**Current full-scope non-regression and production adoption remain unverified.**
Targeted operations improve in scoped measurements, but incomplete panels,
control drift and unfavorable results prevent a broader claim. The completed
[performance evidence](benchmarks.md) remains separate from correctness checks.
Closed campaigns stay closed; the next measurements should qualify consumer
integration.

## Priorities

1. Validate published 0.1.2 with the development website-scrap-engine adapter:
   installed declarations, both downloaders, document cleanup, retries,
   cancellation and pool controls. Then complete MDN ownership and original-input
   replay, comparing output and complete-workload performance against current
   Cheerio and its fastest compatible configuration. Saved consumer snapshots
   do not establish production input weights or complete-crawl performance.
2. Extend actual-browser API and fallback checks beyond the selected correctness
   page. Firefox/Chromium results and exclusions remain documented; WebKit is
   unqualified, so browser support stays best-effort.
3. Broaden stateful fuzzing and allocation-failure coverage. Owned-buffer tests
   do not prove recovery from every upstream or host allocation failure.
4. Start future optimization work from source analysis and profiles, then use a
   fixed comparison to confirm a concrete finding. Preserve callback order,
   snapshots, identity and unfavorable evidence.

Keep [dependency patches](../native/patches/README.md) small and regression-tested.
Additional native platforms depend on demand and maintenance capacity. Current
evidence does not justify new schedulers, JITs or backend frameworks.
[Historical milestones](history/roadmap.md) retain earlier decisions.
