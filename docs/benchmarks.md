# Performance evidence

The adoption target is **at least 3× current Cheerio** for the complete required
DOM workload, including bindings, callbacks, serialization and disposal, while
also beating the fastest compatible Cheerio/parse5 or htmlparser2 configuration.
Pooled Wasm on Node is primary. This target does not describe whole-downloader or
browser speed; production input weights remain unvalidated.

## Current result

**Current full-scope non-regression and production adoption remain unverified.**
Experimental 0.1.1 is published; 0.1.2 has scoped improvements, incomplete panels,
control drift and unfavorable results. Correctness qualification is recorded in
[testing](testing.md) and does not turn inconclusive timing into a pass.

## 0.1.2 read paths and remote comparisons

First-element reads, raw child arrays, text properties and wrapping avoid
unnecessary IDs, selections, views and traversals. The focused comparison stops
at its fixed deadline with **711/1,024 blocks** and no complete four-group panel.
Pooled first-element reads have a descriptive before/current median of **7.8712**,
control **1.0245**. Native HTML600 is unfavorable at **0.9444**, control **0.9703**;
other targeted results also have control drift. See
[all groups and controls](history/read-performance.md#four-read-path-changes).

The preceding `c807bdb` run completes **120/122 comparisons**, with **11,521 blocks**
across 32 panels. Pooled HTML600 is near parity with 0.1.1 (**1.0061**, control
**0.9996**), as is the frozen consumer (**0.9974**, control **1.0051**). Two
real-page/Cheerio comparisons stop on swap guards. These results qualify neither
the later read changes nor the development consumer. The
[full methods and rows](history/read-performance.md#full-comparison-at-c807bdb)
remain separate from historical adoption screens. Both campaigns are closed.

## 0.1.2 reported CI runs

CI is reported passing at `71db6d3` and `654c9b9`. Their
[32 supplied rows](history/development-benchmarks.md#012-reported-ci-runs) compare
each with published 0.1.1: authored results are near parity, XML controls limit
small gain claims, and SVG remains below 3× Cheerio. Raw blocks and artifact hashes
were not supplied. The [later receipt](history/read-performance.md#reported-ci-after-the-wrapper-change)
favors the wrapper change on four medians with control drift; it does not confirm
the remaining CI jobs.

## 0.1.2 API optimizations

Static traversal, live attributes and containment use fewer calls or handles.
The fixed local comparison completes 55/240 blocks: one scoped non-regression
pass and fifteen inconclusive panels. A separate server attempt stops in preflight.
[Counts, panels and stopping rules](history/development-benchmarks.md#012-api-optimizations)
preserve the scope without a full-scope claim.

## Earlier evidence

Historical reports retain original protocols, controls, failures and exclusions.
They are not measurements of the current complete workload.

| Checkpoint | Outcome and detailed evidence |
|---|---|
| <a id="012-fragment-load-child-and-form-fixes"></a>Fragment/load/child/form | [Zero of 237 blocks](history/development-benchmarks.md#012-fragment-load-child-and-form-fixes); all sixteen panels stop before timing |
| <a id="012-insertion-and-ownership-corrections"></a>Insertion/ownership | [81/228 retained blocks](history/development-benchmarks.md#012-insertion-and-ownership-corrections); two passes, fourteen inconclusive |
| <a id="compatibility-review-follow-up"></a>Six-fix review | [Eleven retained blocks](history/development-benchmarks.md#compatibility-review-follow-up); all six panels incomplete with drifting controls |
| <a id="relative-list-resource-correction"></a>Relative-list resources | [12 rather than 40,013 returned IDs](history/development-benchmarks.md#relative-list-resource-correction); repeated replacements plateau, no elapsed-speed claim |
| <a id="html-wrapper-allocation"></a>Wrapper allocation | [Four-process confirmation](history/read-performance.md#html-wrapper-allocation); 1.0352 before/current, 1.0062 control, one unfavorable group; earlier slowdown not fully explained |
| Selected Wasm writer | [Scoped HTML600/seeded p90 gains](history/performance-review.md#selected-writer-summary); separate twenty-panel screen has six passes, one failure, thirteen inconclusive |
| <a id="consumer-bottlenecks-and-bulk-insertion"></a>Bulk insertion | [Parse-once/clone diagnostic](history/release-followups.md#consumer-bottlenecks-and-bulk-insertion); API usage opportunity, not a consumer multiplier |
| <a id="historical-checkpoints"></a>Architecture and insertion | [Scoped passes and inconclusive controls](history/release-followups.md#historical-checkpoints) |
| <a id="scalar-ascii-scan-confirmation"></a>Scalar scan | [Scoped pooled pass](history/release-followups.md#scalar-ascii-scan-confirmation) with narrow selector headroom |
| <a id="historical-adoption-evidence"></a>Pre-refactor adoption | [Aggregate screens](history/release-followups.md#historical-adoption-evidence) on authored/saved inputs; production weights unqualified |

## 0.1.1 release measurements

Reported CI, Firefox 150 and Chromium 140 use four authored workloads. Firefox
exceeds 3× both Cheerio configurations in that report; Chromium exceeds 3× default
Cheerio only on HTML600. Controls and missing raw blocks limit precision. The
[40 original rows](history/release-benchmarks.md#011-release-measurements) retain all
ratios and qualifications. [Browser correctness](testing.md#reported-browser-runs)
is a separate selected-suite result.

## Hosted CI and browser demo

CI compares the verified package, npm latest and pinned Cheerio's default and
htmlparser2 parsers. CI and the demo share `demo/workload.js` and
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
initialization occur outside timing. Ordinary GC and compilation effects remain.

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
