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

Development CI at `71db6d3` and `654c9b9` is
[reported as passing](testing.md#reported-012-ci-passes). Their
[Wasm summaries](#012-reported-ci-runs) compare each candidate with published
0.1.1. The latest report is near parity with 0.1.1 on these authored cases, with
material XML control drift and SVG below 3× Cheerio.

The latest 0.1.2 [API optimization pass](#012-api-optimizations) has one scoped
non-regression pass and fifteen inconclusive panels. Its separate server
comparison stops during preflight and supplies no remote speed estimate.
The preceding fragment/load/child/form
[follow-up](#012-fragment-load-child-and-form-fixes) obtained no timing samples
because every panel stopped on host activity. Its non-regression remains unverified.
The preceding insertion/ownership [review](#012-insertion-and-ownership-corrections)
has two scoped passes and fourteen inconclusive panels. Neither establishes
full-scope non-regression or a new adoption multiplier.

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

## 0.1.2 reported CI runs

Both development CI runs were reported as passing on 2026-10-22. The supplied
benchmark summaries use **current 0.1.2, published Wasm 0.1.1 and Cheerio 1.2.0**,
with pooled heaps. CI runs the shared browser workload under Node; these reports
do not add actual-browser qualification. The tables retain the supplied precision.
CI logs, raw block observations, order breakdowns and artifact hashes were not
supplied for independent inspection.

Ratios are reference time divided by current time; values above one favor current.
"Released Wasm" means published 0.1.1 in both reports. Counts are probe-retained /
complete blocks, summed across the displayed comparison rows. The CI harness and
shared workload are unchanged between the two commits.

### 71db6d3

The fragment/load/child/form fixes at
[`71db6d3`](https://github.com/website-local/grovedom/commit/71db6d3dbf14c8241c25a1453ccb46822c78ae5a):

| Case | Reference / current | Raw | Probe-filtered | Kept / complete |
|---|---|---:|---:|---:|
| articles-120 | released Wasm | 1.015× | 1.015× | 48/48 |
| articles-120 | Cheerio default | 3.912× | 3.912× | 48/48 |
| articles-120 | Cheerio htmlparser2 | 2.811× | 2.811× | 48/48 |
| articles-120 | identical Wasm control | 1.010× | 1.010× | 48/48 |
| articles-600 | released Wasm | 0.973× | 0.973× | 48/48 |
| articles-600 | Cheerio default | 6.302× | 6.302× | 47/47 |
| articles-600 | Cheerio htmlparser2 | 5.009× | 5.009× | 47/47 |
| articles-600 | identical Wasm control | 0.981× | 0.981× | 47/47 |
| sitemap-600 | released Wasm | 1.034× | 1.034× | 47/47 |
| sitemap-600 | Cheerio default | 4.508× | 4.508× | 47/47 |
| sitemap-600 | Cheerio htmlparser2 | 4.440× | 4.440× | 47/47 |
| sitemap-600 | identical Wasm control | 1.054× | 1.054× | 47/47 |
| svg-300 | released Wasm | 1.019× | 1.019× | 47/47 |
| svg-300 | Cheerio default | 2.970× | 2.970× | 47/47 |
| svg-300 | Cheerio htmlparser2 | 2.958× | 2.958× | 47/47 |
| svg-300 | identical Wasm control | 1.056× | 1.056× | 48/48 |

Displayed kept/complete counts sum to **758/758**.

### 654c9b9

The API optimizations at
[`654c9b9`](https://github.com/website-local/grovedom/commit/654c9b9ffc5e0f5663a8875212c15433eda909cb):

| Case | Reference / current | Raw | Probe-filtered | Kept / complete |
|---|---|---:|---:|---:|
| articles-120 | released Wasm | 1.022× | 1.023× | 62/64 |
| articles-120 | Cheerio default | 4.083× | 4.083× | 64/64 |
| articles-120 | Cheerio htmlparser2 | 2.691× | 2.683× | 63/64 |
| articles-120 | identical Wasm control | 0.986× | 0.983× | 62/64 |
| articles-600 | released Wasm | 1.012× | 1.012× | 64/64 |
| articles-600 | Cheerio default | 7.659× | 7.657× | 63/64 |
| articles-600 | Cheerio htmlparser2 | 5.193× | 5.193× | 62/64 |
| articles-600 | identical Wasm control | 0.981× | 0.978× | 63/64 |
| sitemap-600 | released Wasm | 1.007× | 1.006× | 63/64 |
| sitemap-600 | Cheerio default | 4.493× | 4.493× | 63/63 |
| sitemap-600 | Cheerio htmlparser2 | 4.411× | 4.411× | 63/63 |
| sitemap-600 | identical Wasm control | 1.068× | 1.066× | 62/63 |
| svg-300 | released Wasm | 1.032× | 1.032× | 62/63 |
| svg-300 | Cheerio default | 2.948× | 2.948× | 61/63 |
| svg-300 | Cheerio htmlparser2 | 2.986× | 2.986× | 63/63 |
| svg-300 | identical Wasm control | 1.077× | 1.077× | 63/64 |

Displayed kept/complete counts sum to **1,003/1,018**.

The latest filtered released/current HTML ratios are 1.023× and 1.012×, with
controls of 0.983× and 0.978×. Sitemap/SVG ratios of 1.006×/1.032× accompany
controls of 1.066×/1.077×. Those XML control offsets limit small gain claims;
they are not formal error bounds and are not used to normalize the ratios.

SVG remains below 3× against both Cheerio configurations in both reports:
the latest ratios are 2.948× default and 2.986× htmlparser2. The latest
articles-120 htmlparser2 ratio is 2.683×. The complete-workload adoption target
and fastest-compatible comparison remain as defined above.

These separate CI runs do not supply a paired `71db6d3` → `654c9b9` estimate;
dividing their ratios or comparing completed-block counts cannot establish that
incremental gain. The four authored cases also do not directly measure the
three targeted traversal, attribute and containment probes. Hosted CI has no
speed threshold. Full-scope non-regression and production adoption remain
unverified; the local and server comparisons below retain their own limits.

## 0.1.2 API optimizations

Static `until` traversals now batch their stop tests; live attribute enumeration
reuses a private snapshot, and containment returns a scalar. Callbacks still
follow live relations after tree edits, while returned selections retain their
membership and identity. Deterministic probes compare the preceding checkpoint
with the current implementation:

| Pooled Wasm probe | Logical calls before / current | Wasm exports before / current |
|---|---:|---:|
| `nextUntil()`, 128 overlapping sibling roots | 8,256 /1 | 24,512 /3 |
| Live enumeration of 128 attributes | 258 /2 | 770 /2 |
| `contains()`, depth 128 | 129 /1 | 129 /1 |
| Ordinary API replay | 2,283 /2,283 | 4,208 /3,728 |

The traversal probe creates one selection instead of 8,385 and no additional
wrappers instead of 127. Containment avoids 128 ancestor wrappers. Instrumented
single-element typed-array constructions fall from 255 to zero and 128 to zero
in those two probes; they measure only that allocation category. Four authored
HTML/XML workloads keep their prior call and backing-allocation counts. Five
ordinary native/pool output hashes match, including the API replay. These counts
do not establish elapsed speed or total JavaScript allocation.

### Local comparison

The fixed plan attempts sixteen panels and 240 blocks against the preceding
fragment/load/child/form checkpoint. **55 blocks complete and pass the independent
probe filter; one panel passes non-regression and fifteen remain inconclusive.**
Thirteen panels stop on activity, including the partially measured SVG case.
The completed small-HTML and sitemap panels have invalid identical-code controls.

Each variant runs in its own process and complete module graph, with one executing
at a time. Three fresh groups each contain five rotated/mirrored blocks, twenty
warmups and two batches per sample. Batches contain four authored replays or two
ordinary/affected API replays, including parse, operations, output and disposal.
Both Cheerio 1.2.0 configurations match the inputs; htmlparser2 uses `emptyAttrs: true`
to preserve boolean-attribute output. The initial incompatible default-htmlparser2
preflight is retained separately.

The activity limit remains 15%, with at most three pauses per panel. Whole-block
probe filtering remains 1.5. Passing requires all three groups, at least three
retained blocks per group and ten overall, raw/filtered before/current at least
0.97, and raw/filtered identical-code controls within 0.97–1.03. No panel is
extended or replaced. All reported raw and filtered ratios coincide here.
Counts are retained / complete / planned blocks; partial estimates cannot pass.

| Backend / Node | Workload | Before / current | Control | Blocks | Result |
|---|---|---:|---:|---:|---|
| Pool /22 | HTML120 | 1.0689 | 1.0658 | 15/15/15 | Inconclusive control |
| Pool /22 | HTML600 | 0.9918 | 1.0238 | 15/15/15 | Pass |
| Pool /22 | Sitemap600 | 1.0074 | 0.9659 | 15/15/15 | Inconclusive control |
| Pool /22 | SVG300 | 0.9895 | 0.9900 | 10/10/15 | Incomplete |
| Pool /24 | HTML120 | — | — | 0/0/15 | Incomplete |
| Pool /24 | HTML600 | — | — | 0/0/15 | Incomplete |
| Pool /24 | Sitemap600 | — | — | 0/0/15 | Incomplete |
| Pool /24 | SVG300 | — | — | 0/0/15 | Incomplete |
| Native /22 | HTML120 | — | — | 0/0/15 | Incomplete |
| Native /22 | HTML600 | — | — | 0/0/15 | Incomplete |
| Native /22 | Sitemap600 | — | — | 0/0/15 | Incomplete |
| Native /22 | SVG300 | — | — | 0/0/15 | Incomplete |
| Pool /22 | Ordinary API | — | — | 0/0/15 | Incomplete |
| Pool /22 | Until128 | — | — | 0/0/15 | Incomplete |
| Pool /22 | Attributes128 | — | — | 0/0/15 | Incomplete |
| Pool /22 | Contains128 | — | — | 0/0/15 | Incomplete |

Within-block Cheerio/current ratios for the available panels are:

| Workload | Cheerio default / current | Cheerio htmlparser2 / current | Complete blocks |
|---|---:|---:|---:|
| HTML120 | 3.5441 | 2.5515 | 15 |
| HTML600 | 5.1236 | 3.7634 | 15 |
| Sitemap600 | 4.4632 | 4.7314 | 15 |
| SVG300 | 3.0810 | 3.0632 | 10 |

The same controls and completion limits apply. Batches across all implementations
span 3.22–224.49 ms. These are scoped replay results, not a complete-consumer or
production adoption gate.

### Separate server preflight

A separate Node 24 plan reserves twelve panels, eight fresh process groups and
four mirrored blocks per group: 384 measurement blocks in total. Each worker
holds independent before/current/identical module graphs and heaps; only one
worker runs at a time. It retains fixed load, process-memory, swap and page-fault
guards, with no replacement panels.

All sixteen shared correctness checks pass on the server. Ten of twelve
benchmark preflight workers complete; the two pooled HTML workers hit the
no-major-page-fault guard. The required all-preflights condition is therefore
unsatisfied: **zero formal measurement blocks run**. Preflight samples remain
diagnostics and supply no remote speed estimate or statistical gain claim.
No limits are relaxed and the run is closed.

[Correctness](testing.md) and [memory](memory.md) qualification pass separately.
Full-scope elapsed non-regression, broader browser qualification and production
adoption remain unverified.

## 0.1.2 fragment, load, child and form fixes

The fixed follow-up plan compares the four fixes with the preceding insertion/
ownership checkpoint. It attempts sixteen short panels: four authored HTML/XML
workloads on pooled Wasm with Node 22/24 and native with Node 22; three affected
query, form and child-edge workloads on pooled Node 22; and nineteen preserved
consumer scenarios on pooled Node 22. **All sixteen panels stopped before timing
because host activity exceeded the 15% limit. Zero of 237 planned blocks ran.**
This supplies no elapsed non-regression result or speedup estimate.

The plan retains three fresh process groups, twenty warmups, two batches per
sample, four authored replays per batch, two affected-API replays or one consumer
replay. Each block rotates and mirrors separate baseline, current, identical-code
control and compatible Cheerio processes. Authored and affected workloads match
both Cheerio 1.2.0 configurations; the consumer panel uses default Cheerio because
htmlparser2 changes its output. Panels permit three load pauses, the independent
1.5 probe filter and the same raw/filtered 0.97 non-regression and 0.97–1.03 control
criteria below. No panel was extended or replaced after the load stops.

Correctness, package and [resource checks](memory.md) pass separately. A raw child
read now transfers one scalar ID and exposes one wrapper; the twelve-read
replacement probe creates 12 wrappers instead of 12,288. Five ordinary native/pool
workloads retain identical output hashes, logical calls, returned IDs and backing
allocation counts. These observations do not establish elapsed performance or
total JavaScript allocation. Earlier timing panels and their controls remain
separate below.

## 0.1.2 insertion and ownership corrections

This bounded check compares the four correctness fixes with the preceding
0.1.2 initialization checkpoint. The plan fixes sixteen panels and 228 blocks
before timing: pooled Wasm on Node 22/24 and native on Node 22 for four authored
workloads, plus native/pool Node 22 panels for nineteen consumer scenarios and
forty-four successful seeded inputs. Every panel was attempted once. **82 blocks
completed, 81 were retained; two panels pass non-regression and fourteen remain
inconclusive.** No panel is extended or replaced to obtain passing controls.

Each variant runs in a separate process, with only one executing at a time.
Three process groups rotate/mirror variant order; each group has five blocks
for authored cases or four for corpus cases. There are twenty replay warmups,
two batches per sample and four authored replays per batch (one corpus replay).
The fixed load limit is 15%, with at most three pauses per panel. A complete
block is filtered only by the independent 1.5 probe ratio. Passing requires
three complete groups, at least three retained blocks per group and ten overall,
raw/filtered before/current at least 0.97 and controls within 0.97–1.03.

Ratios below are medians of available group medians. Raw and filtered values
are identical except where separated by `/`. Partial panels are descriptive;
their incomplete estimates cannot pass. Counts are **retained / complete /
planned blocks**. Controls compare two independent copies of the preceding code.

| Backend / Node | Workload | Before / current | Control | Blocks | Result |
|---|---|---:|---:|---:|---|
| Pool /22 | HTML120 | 1.0405 | 1.0227 | 15/15/15 | Pass |
| Pool /22 | HTML600 | 0.9780 | 0.9691 | 15/15/15 | Inconclusive control |
| Pool /22 | Sitemap600 | 1.0073 | 0.9844 | 15/15/15 | Pass |
| Pool /22 | SVG300 | 1.0562 | 1.0387 | 15/15/15 | Inconclusive control |
| Pool /24 | HTML120 | 1.0172 | 0.9277 | 9/9/15 | Incomplete |
| Pool /24 | HTML600 | 0.9883 /1.0313 | 0.9813 /1.0227 | 1/2/15 | Incomplete |
| Pool /24 | Sitemap600 | — | — | 0/0/15 | Incomplete |
| Pool /24 | SVG300 | 1.1357 | 0.9658 | 2/2/15 | Incomplete |
| Native /22 | HTML120 | 1.0396 | 0.8984 | 1/1/15 | Incomplete |
| Native /22 | HTML600 | 1.0062 | 1.0305 | 2/2/15 | Incomplete |
| Native /22 | Sitemap600 | 1.1025 | 1.0160 | 5/5/15 | Incomplete |
| Native /22 | SVG300 | 0.7515 | 0.6863 | 1/1/15 | Incomplete |
| Pool /22 | Consumer19 | — | — | 0/0/12 | Incomplete |
| Pool /22 | Seeded44 | — | — | 0/0/12 | Incomplete |
| Native /22 | Consumer19 | — | — | 0/0/12 | Incomplete |
| Native /22 | Seeded44 | — | — | 0/0/12 | Incomplete |

All four completed pooled Node 22 panels also compare Cheerio 1.2.0 default and
htmlparser2, with exact output agreement checked before timing. Raw/filtered
Cheerio/current ratios, calculated within each block, are identical here:

| Workload | Cheerio default / current | Cheerio htmlparser2 / current |
|---|---:|---:|
| HTML120 | 3.6088 | 2.6884 |
| HTML600 | 5.1500 | 3.9023 |
| Sitemap600 | 4.5870 | 4.8607 |
| SVG300 | 3.1419 | 3.1252 |

The controls above still apply; no normalization is used. Across those four
panels, recorded batches span 3.26–241.36 ms across all implementations. Consumer
and seeded inputs differ under htmlparser2, so those planned panels use default
Cheerio only; neither obtained a timing block. Saved consumer correctness and
the [memory checks](memory.md) pass separately. Native/pool ordinary-workload
output hashes, kernel calls, returned IDs and backing-allocation counts are
unchanged, but that does not establish unchanged JavaScript allocation or elapsed
cost. This pass supplies no universal speedup, complete-workload 3× gate or
actual-browser result. Earlier unsuccessful comparisons remain below.

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
