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
**Full-scope non-regression and production adoption remain unverified.**

Later validator, node-kind, XML-span and XML-attribute-atom trials supply no
supported primary gain and are not selected. The final atom trial has seventeen
median passes and seven inconclusive panels; promising pooled seeded tails do
not pass multiplicity correction. The compact [performance review](history/performance-review.md)
preserves methods, selected-panel tables, rejected trials and unfavorable evidence.
[Correctness qualification](testing.md) is a separate requirement.

## Compatibility review follow-up

The six-fix review completed thirteen of seventy-two planned timing blocks;
eleven passed the independent probe filter. All six panels are incomplete,
with material control drift. Final callback changes were correctness-tested
without another timing campaign; no elapsed non-regression or gain is claimed.
[Methods and operation counts](history/release-followups.md#compatibility-review-follow-up)
retain the draft and final results.

## Relative-list resource correction

Ordering relative selector lists now handles matched IDs without registering
unrelated descendants. A two-match sparse query returns **12 IDs instead of
40,013**, with eleven kernel calls in both versions. Eight query/empty/refill
cycles plateau at **2,736,592 native / 1,566,468 pooled-Wasm bytes**, down from
10,977,504 / 6,010,900. Both versions release tracked live bytes on disposal.
Caching raw character-data kind reduces 120 repeated writes from 240 to 121
calls; first writes to 120 distinct handles remain 240 calls.
[Probe details](history/release-followups.md#relative-list-resource-correction)
separate retained capacity from RSS, post-disposal leaks and elapsed performance.

## 0.1.1 release measurements

Experimental 0.1.1 was released on 2026-10-17 from
[`cb2c8e9`](https://github.com/website-local/grovedom/commit/cb2c8e947864c05e3308c4afe8aa2dfffea4b43a).
These reported summaries cover the release CI run and browser demo runs in
**Firefox 150** and **Chromium 140**, using pooled Wasm and the same four authored
workloads. Ratios retain their supplied precision. Raw per-block samples and
order breakdowns were not supplied for these runs, so the summaries have not
been independently recomputed. They remain separate from the earlier audited CI
run and from controlled local comparisons.

All ratios are reference time divided by GroveDOM time; larger values favor
GroveDOM. Counts show probe-retained / complete blocks. The demo checks output
equality during replay; these timings do not run the full browser correctness
suite or establish a production workload distribution. Separate reported
[correctness-page runs](testing.md#reported-browser-runs) pass the selected suite
in Firefox 150 and Chromium 140.

### Release CI

The Node CI benchmark selected npm Wasm **0.1.0** before publishing **0.1.1**,
so its released/current labels correctly differ. Cheerio is **1.2.0**.

| Case | Reference / GroveDOM | Raw | Probe-filtered | Kept / complete |
|---|---|---:|---:|---:|
| articles-120 | released Wasm | 1.084× | 1.084× | 49/49 |
| articles-120 | Cheerio default | 3.776× | 3.776× | 48/48 |
| articles-120 | Cheerio htmlparser2 | 2.791× | 2.791× | 48/48 |
| articles-120 | identical Wasm control | 1.012× | 1.012× | 47/48 |
| articles-600 | released Wasm | 1.039× | 1.039× | 48/48 |
| articles-600 | Cheerio default | 6.276× | 6.273× | 47/48 |
| articles-600 | Cheerio htmlparser2 | 4.910× | 4.910× | 48/48 |
| articles-600 | identical Wasm control | 0.993× | 0.993× | 48/48 |
| sitemap-600 | released Wasm | 1.022× | 1.024× | 47/48 |
| sitemap-600 | Cheerio default | 4.530× | 4.530× | 47/48 |
| sitemap-600 | Cheerio htmlparser2 | 4.456× | 4.456× | 48/48 |
| sitemap-600 | identical Wasm control | 1.068× | 1.068× | 48/48 |
| svg-300 | released Wasm | 1.040× | 1.040× | 48/48 |
| svg-300 | Cheerio default | 3.039× | 3.039× | 48/48 |
| svg-300 | Cheerio htmlparser2 | 3.041× | 3.041× | 48/48 |
| svg-300 | identical Wasm control | 1.053× | 1.053× | 48/48 |

The displayed counts retain **765/769** complete blocks. Article ratios favor
0.1.1 in this run. The smaller sitemap/SVG improvements over 0.1.0 remain
inconclusive against controls of 1.068×/1.053×. SVG's 3.039×/3.041× Cheerio
medians have little margin above 3×. An earlier independently audited run at
the same commit reported 2.911×/2.910× for SVG, with a 1.050× control; preserve
that result separately. These summaries do not establish a robust per-case or
full-workload adoption pass.

### Firefox 150

Reported from the hosted 0.1.1 demo. Browser comparisons use Cheerio 1.2.0's
versioned CDN modules; dependency resolution can differ from CI's npm install.

| Case | Reference / GroveDOM | Raw | Probe-filtered | Kept / complete |
|---|---|---:|---:|---:|
| articles-120 | Cheerio default | 4.80× | 4.80× | 10/10 |
| articles-120 | Cheerio htmlparser2 | 3.62× | 3.62× | 10/10 |
| articles-120 | identical Wasm control | 1.03× | 1.03× | 10/10 |
| articles-600 | Cheerio default | 6.20× | 6.20× | 10/10 |
| articles-600 | Cheerio htmlparser2 | 4.59× | 4.61× | 9/10 |
| articles-600 | identical Wasm control | 1.05× | 1.05× | 10/10 |
| sitemap-600 | Cheerio default | 7.06× | 7.15× | 8/9 |
| sitemap-600 | Cheerio htmlparser2 | 6.61× | 6.64× | 8/9 |
| sitemap-600 | identical Wasm control | 1.06× | 1.09× | 8/9 |
| svg-300 | Cheerio default | 5.00× | 5.00× | 10/10 |
| svg-300 | Cheerio htmlparser2 | 5.08× | 5.08× | 10/10 |
| svg-300 | identical Wasm control | 1.11× | 1.10× | 9/10 |

The displayed counts retain **112/117** complete blocks. All four workload
medians exceed 3× against both Cheerio configurations in this report. Raw
controls range from 1.03× to 1.11×, and filtered controls from 1.03× to 1.10×;
these offsets limit precision and are not formal error bars.

### Chromium 140

A separate reported browser-demo run gives smaller relative gains:

| Case | Reference / GroveDOM | Raw | Probe-filtered | Kept / complete |
|---|---|---:|---:|---:|
| articles-120 | Cheerio default | 2.33× | 2.33× | 6/6 |
| articles-120 | Cheerio htmlparser2 | 1.72× | 1.72× | 5/5 |
| articles-120 | identical Wasm control | 1.00× | 1.00× | 5/5 |
| articles-600 | Cheerio default | 3.89× | 3.89× | 5/5 |
| articles-600 | Cheerio htmlparser2 | 2.88× | 2.88× | 5/5 |
| articles-600 | identical Wasm control | 1.02× | 1.01× | 5/6 |
| sitemap-600 | Cheerio default | 2.77× | 2.77× | 6/6 |
| sitemap-600 | Cheerio htmlparser2 | 2.98× | 2.98× | 6/6 |
| sitemap-600 | identical Wasm control | 1.03× | 1.03× | 6/6 |
| svg-300 | Cheerio default | 1.96× | 1.96× | 6/6 |
| svg-300 | Cheerio htmlparser2 | 1.92× | 1.92× | 6/6 |
| svg-300 | identical Wasm control | 1.02× | 1.02× | 6/6 |

The displayed counts retain **67/68** complete blocks. GroveDOM is faster than
both Cheerio configurations in every reported case, but only articles-600
exceeds 3× against Cheerio default. Raw and filtered controls stay within
1.00×–1.03×. These lower ratios remain part of the evidence.

The browser reports do not establish matched host conditions, and their
relative ratios do not measure absolute engine speed. Do not average the two
browsers or divide their ratios by the controls. Browser-wide 3× performance,
broader browser API qualification and production adoption remain unverified.

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

## Short checks

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
medians, four blocks per group, at least three retained per group and ten overall.

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
