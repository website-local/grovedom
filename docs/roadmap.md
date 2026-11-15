# Readiness and next work

Experimental **0.1.3 is published**; `main` targets **0.1.4 (unreleased)**.
Pooled Wasm on Node is primary, native is a separate package, and browsers use
the same Wasm binary with async initialization. The
[compatibility guide](compatibility.md) defines the supported contract.

## Current status

Development 0.1.4 adds [style/wrapper reuse](history/operation-reuse.md),
[kernel work reductions](history/kernel-work-reduction.md) and
[namespace lifetime fixes and selection reuse](history/selection-and-namespace-reuse.md).
The direct byte-input shortcut was withdrawn after decoder regressions.
Both selection modes, APIs, declarations and explicit ownership remain unchanged.
The Browser demo default stays at published v0.1.3.

All hosted jobs and the gate were reported passing for `5026b83`, before the
decoder correction. [Current qualification](testing.md#current-qualification)
separates that full-suite/CI checkpoint from the correction's focused, package
and portable-browser checks. The [supplied benchmark](benchmarks.md#014-reported-ci)
also predates the correction.

The [bounded MDN replay](integration.md#bounded-mdn-013-evidence) uses GroveDOM
0.1.3 with engine 0.10.0. It supports continued experimental evaluation;
current-package consumer support, full-scope non-regression, sustained memory
and production adoption remain unverified. Keep Cheerio as the consumer default,
`loadFast()` opt-in and the existing strong wrapper cache.

## Priorities

1. Verify CI and release artifacts for the final corrected commit before an
   **experimental 0.1.4 release**. Further optimization experiments are not a
   prerequisite.
2. Before removing the experimental designation, qualify that exact package in
   the current MDN/engine consumer. Preserve original responses and compare exact
   outputs, both loaders and the complete required DOM workload against current
   Cheerio and its fastest compatible configuration. The target remains at least
   3× current Cheerio with acceptable sustained memory; whole-pipeline ratios
   are a separate metric. Extend agreed locale/archive, asset and offline-browser
   coverage at the same adopted revision.
3. Extend actual-browser API/fallback checks beyond the selected Firefox/Chromium
   correctness page; WebKit remains unqualified. Broaden stateful fuzzing and
   allocation-failure coverage when a concrete consumer need warrants it.
4. Start new optimization work from source analysis and a profile of the corrected
   package in the consumer, then use a fixed comparison to confirm a finding.
   Keep completed campaigns closed and retain unfavorable evidence.

Caller batching, early tag gates, secondary attribute guards, streaming contains,
wide attribute indexes and bounded custom nth-of remain deferred pending a
matching workload. Permanent stepping, relational-existence replacement,
automatic buffer discard, general serialization replacement, default block I/O
and transparent direct byte loading remain excluded in their proposed forms.
The [implementation record](history/selection-and-namespace-reuse.md) preserves
their scope and the withdrawn byte shortcut's historical results.

Keep [dependency patches](../native/patches/README.md) small and regression-tested.
Additional native platforms depend on demand and maintenance capacity; current
evidence does not justify new schedulers, JITs or backend frameworks.
[Historical milestones](history/roadmap.md) retain earlier decisions.
