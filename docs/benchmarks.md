# Performance evidence

The adoption target is **at least 3× current Cheerio** for the complete required
DOM workload, including bindings, callbacks, serialization and disposal, while
also beating the fastest compatible Cheerio/parse5 or htmlparser2 configuration.
Pooled Wasm on Node is primary. This target does not describe whole-downloader or
browser speed; production input weights remain unvalidated.

## Current result

**Current full-scope non-regression and production adoption remain unverified.**
Experimental 0.1.3 is published; development 0.1.4 remains experimental and
unreleased. [Correctness qualification](testing.md#current-qualification) and
authored-workload timings answer separate questions.

The 0.1.4 [style/wrapper](history/operation-reuse.md),
[kernel](history/kernel-work-reduction.md) and
[namespace/selection](history/selection-and-namespace-reuse.md) records preserve
scoped gains, adverse observations, control drift and incomplete panels.
The direct byte-input shortcut was withdrawn after decoder regressions, so its
earlier speed and capacity benefits no longer apply to current source.

Keep Cheerio as the consumer default and `loadFast()` opt-in. The next useful
investigation profiles the corrected package in the actual consumer, followed by
a fixed comparison of the complete DOM workload and sustained memory.
[Bounded MDN evidence](integration.md#bounded-mdn-013-evidence) uses 0.1.3 and
does not qualify 0.1.4. Further speculative optimization experiments are not a
prerequisite for an experimental release.

## 0.1.4 reported CI

The [November 15 receipt](history/release-benchmarks.md#014-development-ci)
preserves all **36 supplied rows / 1,013 retained paired blocks** for `5026b83`,
comparing development 0.1.4 with published 0.1.3 and Cheerio 1.2.0. All displayed
complete blocks were retained. The user separately confirmed that every hosted
job and the required gate passed, including macOS.

Six of eight release/current medians favor current. Fast sitemap and SVG are
**0.976× / 0.990×**, corresponding to about **2.46% / 1.01% more elapsed time**.
All sixteen Cheerio comparisons exceed 3×, with a minimum of **3.322×**.
Identical-code controls span **1.000–1.067×**. These rounded authored-workload
medians do not establish universal gains, non-regression or complete-consumer
performance; no control normalization or cross-workload average is supplied.

This receipt predates the subsequent byte-decoding correction. It does not
measure the corrected source, whose direct byte-input shortcut was withdrawn.
The [bounded downstream evidence](integration.md#bounded-mdn-013-evidence)
uses published 0.1.3 and leaves sustained memory and the complete DOM target
open. Keep Cheerio as the consumer default and `loadFast()` opt-in.

## Earlier evidence

Each record keeps its own protocol, inputs, controls, adverse results and
qualification limits. Do not combine receipts or infer current performance from
historical checkpoints. Full tables and implementation investigations are
indexed in [history](history/README.md).

| Checkpoint | Detailed evidence and limits |
|---|---|
| <a id="013-reported-ci"></a><a id="release-ci-2026-11-02"></a>0.1.3 release CI | [36 rows / 759 retained blocks](history/release-benchmarks.md#013-release-ci); fast sitemap release ratio 0.991×, compatible HTML120/htmlparser2 2.996× |
| <a id="development-ci-2026-11-01"></a>0.1.3 development CI | [36 rows / 1,180 of 1,210 blocks](history/release-benchmarks.md#013-reported-ci); XML/SVG mode differences remain smaller than control offsets |
| <a id="012-read-paths-and-remote-comparisons"></a>0.1.2 read paths and remote comparisons | [711 of 1,024 focused blocks; preceding 120 of 122 comparisons](history/read-performance.md); incomplete groups, near-parity consumer results and unfavorable observations retained |
| <a id="012-reported-ci-runs"></a>0.1.2 CI | [Release receipts](history/release-benchmarks.md#012-reported-ci) and [development receipts](history/development-benchmarks.md#012-reported-ci-runs); SVG/htmlparser2 remains below 3× in the later release table |
| <a id="012-api-optimizations"></a>0.1.2 API optimizations | [55 of 240 blocks](history/development-benchmarks.md#012-api-optimizations); one scoped pass, fifteen inconclusive panels |
| <a id="012-fragment-load-child-and-form-fixes"></a>Fragment/load/child/form | [Zero of 237 blocks](history/development-benchmarks.md#012-fragment-load-child-and-form-fixes); all sixteen panels stop before timing |
| <a id="012-insertion-and-ownership-corrections"></a>Insertion/ownership | [81 of 228 retained blocks](history/development-benchmarks.md#012-insertion-and-ownership-corrections); two passes, fourteen inconclusive |
| <a id="compatibility-review-follow-up"></a>Six-fix review | [Eleven retained blocks](history/development-benchmarks.md#compatibility-review-follow-up); all six panels incomplete |
| <a id="relative-list-resource-correction"></a>Relative-list resources | [12 rather than 40,013 returned IDs](history/development-benchmarks.md#relative-list-resource-correction); repeated replacements plateau, no elapsed-speed claim |
| <a id="html-wrapper-allocation"></a>Wrapper allocation | [Four-process confirmation](history/read-performance.md#html-wrapper-allocation); 1.0352 before/current, 1.0062 control, one unfavorable group; earlier slowdown not fully explained |
| Selected Wasm writer | [Scoped HTML600/seeded p90 gains](history/performance-review.md#selected-writer-summary); separate twenty-panel screen has six passes, one failure, thirteen inconclusive |
| <a id="consumer-bottlenecks-and-bulk-insertion"></a>Bulk insertion | [Parse-once/clone diagnostic](history/release-followups.md#consumer-bottlenecks-and-bulk-insertion); API usage opportunity, not a consumer multiplier |
| <a id="historical-checkpoints"></a>Architecture and insertion | [Scoped passes and inconclusive controls](history/release-followups.md#historical-checkpoints) |
| <a id="scalar-ascii-scan-confirmation"></a>Scalar scan | [Scoped pooled pass](history/release-followups.md#scalar-ascii-scan-confirmation) with narrow selector headroom |
| <a id="historical-adoption-evidence"></a>Pre-refactor adoption | [Aggregate screens](history/release-followups.md#historical-adoption-evidence) on authored/saved inputs; production weights unqualified |
| <a id="011-release-measurements"></a>0.1.1 CI and browser measurements | [40 original rows](history/release-benchmarks.md#011-release-measurements); Firefox exceeds 3× both parsers, Chromium exceeds 3× default Cheerio only on HTML600 |

## Hosted CI and browser demo

CI compares the verified package, npm latest and pinned Cheerio's default and
htmlparser2 parsers. Both current `load()` and `loadFast()` receive those paired
comparisons and a matching identical-code control; a separate pair measures
compatible/fast directly. The report identifies the current mode in every row.
Both modes and all pairs share the existing job deadline. The browser demo
continues to use compatible `load()`. CI and the demo share `demo/workload.js` and
`demo/comparison.js`: HTML120/600, XML sitemap600 and SVG300, covering parse,
queries, callbacks, edits, traversal, serialization and disposal.

| Setting | CI | Browser demo |
|---|---|---|
| Budget | Two-minute target; measurement ends 105 seconds after the first step; three-minute infrastructure timeout | Thirty seconds, excluding download/initialization |
| Setup | Artifact install, initialization and warmup share the budget; setup exhaustion fails | Versioned jsDelivr Cheerio 1.2.0 URLs; transitive versions can differ from npm |
| Warmup and samples | Twenty replay warmups, 30 probe warmups; two replays per sample | Same paired comparison implementation |
| Output | Every replay verified outside the timer | Every replay verified outside the timer |

Each block keeps opposite-order halves together. Identical-Wasm controls have
separate heaps and byte-identical copies of the **complete JS graph**; copying and
initialization occur outside timing. CI also uses separate complete graphs for
the two current modes to avoid mixing their facade feedback. All variants still
run in one process; this is not an isolated-process mode comparison. Ordinary GC
and compilation effects remain.

Keep all raw and incomplete blocks. Filtering accepts only complete blocks with
positive finite probe readings and independent max/min ≤1.5. Invalid case labels
or nonpositive/nonfinite durations fail. Report paired medians, order breakdowns,
retained counts and controls; require three complete blocks per pair/case.
There is no control normalization or CI speed threshold. Reports include package
versions, Wasm hashes and the resolved lockfile.

The arithmetic probe is separate from clock calls. A 150-call Node 22/24 check
observed 150 loop-exit deoptimizations before that correction and none afterward.
This repairs the probe without explaining DOM regressions or reclassifying old
results. Hosted diagnostics do not replace fresh-process qualification.

## Short checks

Start with source analysis and CPU/allocation profiles. Use timing to confirm a
concrete finding or fix; an idle host is not a prerequisite for diagnosis.

- Fix inputs, options, groups, batches and stopping rules before measurement.
  Never extend or replace a panel to obtain a pass.
- Include recurring allocation, encoding, callbacks, serialization, disposal and
  in-batch GC. Preload inputs; exclude startup, IPC, disk and network.
- Use matching JS/binaries, independent graphs, mirrored/rotated orders and
  identical-code controls. Keep unrelated work out of timing windows.
- Record activity and inherited affinity. Any admission rule or independent
  probe filter belongs to the declared protocol; quiet admission cannot rule out
  JIT/GC drift, and later unfiltered runs do not rewrite earlier filtered results.
- Preserve raw/incomplete results. Never filter by candidate times, normalize by
  controls or combine protocols. Report raw/filtered ratios, counts, controls,
  order groups and batch duration; invalid controls or incomplete data cannot pass.

The [historical short protocols](history/development-benchmarks.md#historical-short-protocols)
retain their 2%/3% thresholds and minimum counts. The
[isolated protocol](history/performance-review.md#best-effort-isolated-optimizations)
uses twelve fresh groups, whole-process bootstrap intervals and family-adjusted
primary p90 tests; secondary medians, p95 or operation counts cannot override it.

## Harnesses

- `bench/window.mjs`: manifest, one to three groups, output file, 1–100 warmups
  and 1–8 replays/batch. Activity defaults to 15%; `--max-busy-percent` accepts
  0–100. `--busy=pause --max-pauses=3` bounds pauses (0–10) across the panel;
  `--busy=run` retains the older retry-and-record behavior. Completed blocks save
  atomically; busy stops exit 2. Changed settings define a separate protocol.
- `bench/phase-profile.mjs`, `bench/consumer-profile.mjs` and `bench/fragment-profile.mjs`
  attribute work. Native ticks are reference-clock ticks, not retired core cycles.
- `bench/run.mjs`, `bench/process.mjs` and `bench/short.mjs` cover authored and
  historical comparisons. Bound counts and inspect actual release imports/features.
- [Developer diagnostics](../diagnostics/README.md) stay outside packages.
  Keep raw profiles and machine-specific manifests outside Git.
