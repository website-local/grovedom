# Performance evidence

The adoption target is **at least 3× current Cheerio** for the complete required
DOM workload, including bindings, callbacks, serialization and disposal, while
also beating the fastest compatible Cheerio/parse5 or htmlparser2 configuration.
Pooled Wasm on Node is primary. This is not a whole-downloader or browser claim;
production input weights remain unvalidated.

## Current result

Experimental 0.1.1 is published. Its [release and browser summaries](#011-release-measurements)
cover Node CI, Firefox 150 and Chromium 140, with material differences between
the reported browser ratios. The earlier isolated investigation remains below.

Development [CI reports](#012-reported-ci-runs) and
[local comparisons](#012-api-optimizations) have scoped passes, invalid controls
and incomplete panels. **Full-scope non-regression and production adoption remain
unverified.** Correctness passes do not resolve those measurement limits.

The completed investigation retains the Wasm HTML opening-tag span writer and
qualified correctness fixes. Native keeps its previous writer. Isolated Node 24
comparisons support these workload-specific improvements:

| Pooled Wasm workload | Lower p90 / p95 time | Before/current p90, 95% interval | Adjusted p |
|---|---:|---|---:|
| Authored HTML600 | 7.8% / 10.6% | 1.0842 [1.0574, 1.1285] | 0.0078 |
| 44 successful seeded inputs | 4.2% / 4.5% | 1.0433 [1.0059, 1.0749] | 0.0313 |

These are fixed-batch amortized replay times. Real-page timing remains incomplete.
The selected runtime's separate twenty-panel comparison against 0.1.0 and the
preceding candidate has **six practical median passes, one failure and thirteen
inconclusive results**. Native HTML120 fails before/current at 0.9689 with valid
control 0.9869. No panel satisfies every median and tail criterion.

Later validator, node-kind, XML-span and XML-attribute-atom trials supply no
supported primary gain and are not selected. The final atom trial has seventeen
median passes and seven inconclusive panels; promising pooled seeded tails do
not pass multiplicity correction. The compact [performance review](history/performance-review.md)
preserves methods, selected-panel tables, rejected trials and unfavorable evidence.
[Correctness qualification](testing.md) is a separate requirement.

## 0.1.2 reported CI runs

CI at `71db6d3` and `654c9b9` is reported as passing. Both compare with
published 0.1.1, not with each other. The latest authored results are near parity
with 0.1.1; XML controls limit small gain claims, and SVG remains below 3× Cheerio.
The [32 reported rows and qualifications](history/development-benchmarks.md#012-reported-ci-runs)
retain the supplied precision; raw blocks and artifact hashes were not supplied.
The [later benchmark receipt](history/read-performance.md#reported-ci-after-the-wrapper-change)
favors the wrapper change on all four medians, with control drift. It does not
independently confirm the remaining CI jobs.

## 0.1.2 read paths and remote comparisons

First-element getters, raw child arrays, text properties and nested wrapping
avoid unnecessary IDs, selections, views or traversals. Seventeen new regressions
preserve successful outputs, snapshots, callback order and disposal.

The focused server comparison retains 711 of 1,024 planned blocks before its
fixed deadline. Pooled first-element reads have a descriptive before/current
median of **7.8712**, control **1.0245**, across three of four planned groups.
The other targeted medians also favor the changes, with substantial control
drift for raw children and wrapping. Native HTML600 is unfavorable at **0.9444**;
its control is **0.9703**. These incomplete panels establish no full-scope
non-regression claim. [All counts, groups and controls](history/read-performance.md#four-read-path-changes)
remain recorded.

The preceding `c807bdb` full server run completes 120 of 122 comparisons across
32 panels and retains 11,521 blocks. Pooled HTML600 is near parity with 0.1.1
(**1.0061**, control **0.9996**); the frozen consumer replay is **0.9974**,
control **1.0051**. Two real-page/Cheerio comparisons stop on swap guards.
[Methods and all 32 rows](history/read-performance.md#full-comparison-at-c807bdb)
remain separate from the later read changes and historical acceptance gates.
Production adoption and current full-scope non-regression remain unverified.

## 0.1.2 API optimizations

Static traversal, live attribute enumeration and containment use fewer calls or
handles. The fixed local comparison completes 55 of 240 blocks: one scoped
non-regression pass and fifteen inconclusive panels. Its separate server attempt
stops in preflight with no formal timing samples. The
[operation counts, sixteen panels and server guards](history/development-benchmarks.md#012-api-optimizations)
remain available. These results do not establish full-scope non-regression.

## 0.1.2 fragment, load, child and form fixes

All sixteen panels stop before timing because host activity exceeds the fixed
15% limit: zero of 237 planned blocks. Correctness and resource checks pass
separately. [Methods and scope](history/development-benchmarks.md#012-fragment-load-child-and-form-fixes)
preserve this unsuccessful attempt.

## 0.1.2 insertion and ownership corrections

The fixed comparison completes 82 of 228 blocks and retains 81. Two panels pass
non-regression; fourteen remain inconclusive. No panel is extended or replaced.
[All ratios, controls and methods](history/development-benchmarks.md#012-insertion-and-ownership-corrections)
remain recorded.

## Compatibility review follow-up

The six-fix review completes thirteen of 72 blocks, with eleven retained.
All six panels remain incomplete and have material control drift.
[Details](history/development-benchmarks.md#compatibility-review-follow-up)
separate the measured draft from final callback corrections.

## Relative-list resource correction

Sparse relative queries return 12 IDs instead of 40,013 while preserving eleven
kernel calls. Repeated query/replacement cycles plateau instead of retaining
unrelated descendants. [Capacity and callback counts](history/development-benchmarks.md#relative-list-resource-correction)
describe this resource correction without an elapsed-speed claim.

## 0.1.1 release measurements

Reported release CI, Firefox 150 and Chromium 140 runs use the same four authored
workloads. Firefox's medians exceed 3× both Cheerio configurations in that report;
Chromium exceeds 3× default Cheerio only on HTML600. Controls and missing raw
blocks limit precision. The [40 original rows](history/release-benchmarks.md#011-release-measurements)
preserve every ratio and qualification. Separate
[browser correctness results](testing.md#reported-browser-runs) cover the selected suite.

## Hosted CI and browser demo

CI compares the verified current package, npm latest and pinned Cheerio's default
and htmlparser2 parsers. CI and the demo share `demo/workload.js` and
`demo/comparison.js`: HTML120/600, XML sitemap600 and SVG300. Work includes parse,
queries, callbacks, edits, traversal, serialization and explicit disposal; output
is checked on every replay.

The whole CI benchmark job targets two minutes. Setup, artifact installation,
initialization and warmup share the budget; measurement ends 105 seconds after
the first step, reserving teardown time. A three-minute timeout handles slow
infrastructure. Setup exhaustion fails explicitly. The browser demo uses thirty
seconds excluding download/initialization; reported runs cover Firefox 150 and
Chromium 140, with WebKit still unqualified. The demo pins Cheerio's version in
its jsDelivr URLs, but CDN bundles can resolve transitive dependencies differently
from CI's npm install.

Each block keeps both opposite-order halves together. Twenty replay warmups and
30 independent probe warmups precede measurement; samples time two replays with
disposal, then verify outputs outside the timer. Identical-Wasm controls use
separate heaps and a byte-identical copy of the **complete JavaScript module
graph**, avoiding shared helper feedback vectors. Copying and initialization occur
outside timing; GC and compilation caches can still affect this process.

Keep every raw/incomplete block. A complete block enters the filtered result only
with positive finite probe readings and independent probe max/min at most 1.5.
Empty or ambiguously labelled case lists and nonpositive/nonfinite sample durations
fail explicitly. Report within-block paired medians and order breakdowns;
require three complete blocks per pair/case, with retained counts and controls
visible. No control normalization or speed threshold applies to hosted CI.
Reports include package versions, Wasm hashes and the resolved lockfile.

The probe's arithmetic loop is separate from clock calls. A 150-call diagnostic
on Node 22/24 observed 150 loop-exit deoptimizations before this fix and none
afterward. This repairs the probe; it does not explain DOM regressions or
reclassify earlier results. Hosted diagnostics do not replace fresh-process gates.

## HTML wrapper allocation

CPU and allocation profiles found extra callback-wrapper bookkeeping after the
API batching change, without establishing a new parsing or GC bottleneck.
HTML600 materializes ID arrays for all 1,200 callback nodes, so those nodes do
not benefit from deferring their arrays. Private records now use ordinary fields
and a direct one-element `Uint32Array` constructor. Laziness, stable selection
storage and borrowed callback arrays remain intact. The generic array factory
also existed in 0.1.1; removing it is an optimization, not proof of the cause of
the entire reported regression.

A separate Node 24 confirmation used four fresh processes, eight mirrored blocks
per process, five independent module graphs, 80 warmups and 16 full HTML600
replays per sample. All 32 blocks were retained, with no activity admission,
probe filtering or forced GC. Median process ratios were **1.0352** for pre-fix
0.1.2 (`654c9b9`)/fixed, **1.0259** for published 0.1.1/fixed and **1.0062** for
the identical-release control. Ordinary fields alone were near neutral
(**1.0044**); direct construction supplied most of the measured improvement.

One process group regressed against pre-fix 0.1.2 (**0.9493**). That pre-fix
version was itself near parity with 0.1.1 in this confirmation (**0.9988**), which
uses a different variant mix and longer batches than the earlier comparison.
These results do not establish that the earlier 5.8% slowdown is fully explained
or eliminated. A separate 10,000-node callback check had substantial control
drift and supplies no precise gain claim. Raw results remain preserved; this
scoped optimization is not full-consumer or universal non-regression evidence.

## Short checks

Start regression investigations with source analysis and CPU/allocation profiles.
Use timing to confirm a concrete finding or candidate fix. Activity admission is
not a prerequisite for diagnosis; declare each confirmation's settings and keep
its evidence separate from the historical acceptance protocols below.

- Fix inputs, parser options, groups, batches and stopping rules before timing.
  Never extend a panel to obtain a pass.
- Preload inputs; include recurring allocation, encoding, mutations, disposal
  and in-batch GC. Exclude startup, IPC, disk and network.
- Use matching JS/binaries, independent module graphs, rotated/mirrored orders
  and identical-code controls. Keep other work out of timing windows.
- Check activity and inherited scheduler affinity before blocks. Quiet admission
  does not rule out JIT/GC drift.
- Preserve raw results and incomplete panels. Filter whole blocks only using
  the independent 1.5 probe limit, never candidate times or control normalization.
- Report settings, raw/filtered ratios, counts, controls and batch duration.
  Keep different protocols separate; incomplete data or invalid controls cannot pass.

Later scoped screens use a **3% tolerance**: baseline/candidate ≥0.97 and controls
within 0.97–1.03, for both raw and filtered estimates. Earlier closed panels keep
their declared 2% rules. The short protocol uses the median of three group
medians, one block per variant per group, at least three retained per group and
ten overall. The comparisons above use four or five variants as declared.

The later isolated protocol uses twelve fresh process groups, whole-process
bootstrap intervals and family-adjusted primary p90 tests. It attempts every
planned panel with a fixed allowance for load pauses. Secondary medians/p95 and
operation counts cannot override a failed primary criterion. See the
[full methods](history/performance-review.md#best-effort-isolated-optimizations).

## Consumer bottlenecks and bulk insertion

Scoped native profiles identify queries, bindings and application URL processing
as larger costs than fragment parsing. An authored parse-once/clone experiment
reduces fragment parses from 320 to four and has a pooled ratio of **1.4606**,
control **0.9913**, across nine quiet retained blocks. This is an API usage
opportunity, not a consumer speedup or permission to cache mutation results.
[Attribution and limits](history/release-followups.md#consumer-bottlenecks-and-bulk-insertion)
retain the counts and profiling methods.

## Historical checkpoints

The architecture refactor and insertion follow-up have scoped passes and
inconclusive controls. [Their results](history/release-followups.md#historical-checkpoints)
remain separate from release timing and current adoption.

### Scalar ASCII-scan confirmation

The scalar scan passed its scoped pooled screen with narrow selector headroom;
[the full ratios, controls and rejected prototype](history/release-followups.md#scalar-ascii-scan-confirmation)
remain available. Logical read reductions do not establish a universal speedup.

### Historical adoption evidence

Pre-refactor aggregate screens against Cheerio 1.2.0 passed for their authored
and saved-input panels. [Ratios and controls](history/release-followups.md#historical-adoption-evidence)
do not qualify current production weights, browser speed or the whole downloader.

## Harnesses

- `bench/window.mjs` accepts a manifest, one to three groups and an output file;
  warmups range 1–100 and replays/batch 1–8. The activity threshold defaults to
  15%; `--max-busy-percent` explicitly changes it within 0–100. Record changes as
  separate protocols. Completed blocks are saved atomically; busy stops exit 2.
- `--busy=pause --max-pauses=3` permits a bounded pause/recheck budget across the
  whole panel (0–10 pauses). No measured block is repeated. `--busy=run` retains
  the older retry-and-record behavior.
- `bench/phase-profile.mjs`, `bench/consumer-profile.mjs` and `bench/fragment-profile.mjs`
  attribute work; they are not acceptance timers. Native ticks are elapsed
  reference-clock ticks, not retired core cycles.
- `bench/run.mjs`, `bench/process.mjs` and `bench/short.mjs` cover authored/historical
  comparisons. Use bounded counts and inspect actual release imports/features.
- [Developer diagnostics](../diagnostics/README.md) stay outside published packages.
  Keep raw profiles and machine-specific manifests outside Git.
