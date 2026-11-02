# Readiness and next work

Experimental **0.1.3 is published**; `main` targets **0.1.4 (unreleased)**.
Pooled Wasm on Node is primary, native is a separate package, and browsers use
the same Wasm binary with async initialization. The
[compatibility guide](compatibility.md) defines the supported contract.

## Current status

Release 0.1.3 adds direct facade state, selected allocation/loop improvements
and opt-in [`loadFast()` selections](compatibility.md#selection-modes).
Compatible `load()` and fast selections share one implementation and retain
explicit document ownership. [Correctness and resource qualification](testing.md#current-qualification)
records the scoped mode, package, worker and portable browser checks, alongside
earlier sanitizer, fuzz and lifecycle evidence.

Publication was reported on 2026-11-02. Development metadata now selects 0.1.4,
with runtime and declarations unchanged from 0.1.3. The manual Browser demo
default is v0.1.3. Separate [development and release CI receipts](benchmarks.md#013-reported-ci)
retain their controls and unfavorable results; complete consumer performance
remains open in `mdn-local`. Prior actual-browser results still apply to their
named 0.1.1 checkpoint, and published-package engine qualification remains at 0.1.2.

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
   ownership and lifecycle APIs and supported Node/CI versions. Establish a
   Cheerio baseline, then qualify published 0.1.3 compatible `load()` with
   original-input replay. Audit numeric selection access and loader/hook types
   before opting into `loadFast()`. Compare both modes on the same complete
   required DOM workload, outputs and memory limits; earlier 0.1.2 checks
   remain historical evidence.
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
