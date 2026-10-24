# Development benchmark details

These completed 0.1.2 comparisons retain their original protocols, failed controls
and incomplete panels. See the [current summary](../benchmarks.md) for readiness.

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

[Correctness](../testing.md) and [memory](../memory.md) qualification pass separately.
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

Correctness, package and [resource checks](../memory.md) pass separately. A raw child
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
the [memory checks](../memory.md) pass separately. Native/pool ordinary-workload
output hashes, kernel calls, returned IDs and backing-allocation counts are
unchanged, but that does not establish unchanged JavaScript allocation or elapsed
cost. This pass supplies no universal speedup, complete-workload 3× gate or
actual-browser result. Earlier unsuccessful comparisons remain below.

## Compatibility review follow-up

The six-fix review completed thirteen of seventy-two planned timing blocks;
eleven passed the independent probe filter. All six panels are incomplete,
with material control drift. Final callback changes were correctness-tested
without another timing campaign; no elapsed non-regression or gain is claimed.
[Methods and operation counts](release-followups.md#compatibility-review-follow-up)
retain the draft and final results.

## Relative-list resource correction

Ordering relative selector lists now handles matched IDs without registering
unrelated descendants. A two-match sparse query returns **12 IDs instead of
40,013**, with eleven kernel calls in both versions. Eight query/empty/refill
cycles plateau at **2,736,592 native / 1,566,468 pooled-Wasm bytes**, down from
10,977,504 / 6,010,900. Both versions release tracked live bytes on disposal.
Caching raw character-data kind reduces 120 repeated writes from 240 to 121
calls; first writes to 120 distinct handles remain 240 calls.
[Probe details](release-followups.md#relative-list-resource-correction)
separate retained capacity from RSS, post-disposal leaks and elapsed performance.

## Historical short protocols

Later scoped screens use a **3% tolerance**: baseline/candidate ≥0.97 and controls
within 0.97–1.03, for both raw and filtered estimates. Earlier closed panels keep
their declared 2% rules. The short protocol uses the median of three group
medians, one block per variant per group, at least three retained per group and
ten overall. The comparisons above use four or five variants as declared.

The later isolated protocol uses twelve fresh process groups, whole-process
bootstrap intervals and family-adjusted primary p90 tests. It attempts every
planned panel with a fixed allowance for load pauses. Secondary medians/p95 and
operation counts cannot override a failed primary criterion. See the
[full methods](performance-review.md#best-effort-isolated-optimizations).
