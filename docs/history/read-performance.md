# Read-path and remote comparisons

These 0.1.2 diagnostics were collected on 2026-10-23/24. The full run measures
`c807bdb` against published 0.1.1; the later focused run measures four read-path
changes against `c807bdb`. They use different fixed protocols and cannot be
combined into an incremental or production speedup. Every completed block is
retained, including unfavorable observations. See the [current summary](../benchmarks.md).

## Four read-path changes

Source review and deterministic counts identified work that does not affect
successful results. The retained implementation narrows known first-element
reads, wraps raw traversal results directly, passes scalar text-property IDs,
and reuses each child traversal during nested wrapping. It preserves pending
writes, aggregate reads, array snapshots, handles and callbacks.

[Authored fixtures](../../bench/read-fixtures.mjs) give identical before/current
outputs and counts on native and pooled Wasm:

| Fixture | Counted work | Before | Current |
|---|---|---:|---:|
| Six getters over 6,000 matches, repeated 64 times | Read IDs | 2,304,000 | 384 |
| Raw children of 128 parents, repeated four times | Temporary selections | 1,024 | 0 |
| Text properties and option fallback, repeated 256 times | Singleton subarray views | 768 | 0 |
| Nested wrapping of 16 elements | Child traversals | 336 | 192 |
| Same nested wrapping | Selections | 607 | 463 |

Read calls remain 384 in the first fixture and 1,280 in the text-property
fixture; raw children still use 512 traversals. These are selected operation
counts, not total allocations. The earlier 48-page diagnostic made 1,051 raw
child reads, each formerly creating two selections. Neither principal pattern
occurs in HTML600 or the frozen 19-case consumer replay, so they do not explain
the earlier roughly 6% HTML600 slowdown.

### Focused server method

The plan uses Node 24.21.0, four fresh process groups per backend/comparison,
eight ABBA/BAAB blocks per case and an independent identical-`c807bdb` control.
Each process loads two separate complete module graphs and native image
identities. Input, source, artifact and expected-output hashes are checked.

The first three fixtures time retained-document operations, excluding setup and
disposal. Nested wrapping, HTML600, SVG300 and consumer19 include parse,
operations, serialization and disposal. Saved pages sum 48 individual DOM
intervals, excluding output verification. Every measured result is checked.
Warmups are 32 replays, except one for saved pages/consumer19. Sample batches
contain four first-getter or HTML600 replays, eight SVG300 replays, two other
targeted replays or one saved-page/consumer replay.

One low-priority worker runs at a time, with at least three times each work
interval in untimed rests, a 250 ms minimum and a two-second worker gap. The
existing full-run scheduler is paused while its active worker finishes; the
focused measurement then starts, and the scheduler resumes automatically
afterward. There is no idle-host admission,
probe filtering, forced GC, control normalization or result-driven extension.
Resource and time guards remain active.

The fixed 35-minute wall budget stops the run at **711/1,024 blocks**, with
11/16 workers complete and one partial worker. No new OOM event or output
mismatch is recorded. Three candidate groups complete for every case. Pooled
controls complete three groups; native controls complete two, plus seven blocks
of a third saved-page group. The fourth group is never started. No panel
completes its prescribed four groups, so none receives a formal pass.

Each block ratio is the geometric mean of its two before times divided by the
geometric mean of its two comparison times. Tables report the median of the
observed group medians; each complete group has eight blocks. All values are
descriptive. A control above or below one is not a correction factor or error
bound. The starred native saved-page control group contains seven blocks.

| Backend | Case | Before / current | Control | Candidate / control blocks (32 planned each) | Candidate group medians | Control group medians |
|---|---|---:|---:|---:|---|---|
| Pool | First-read6000 | 7.8712 | 1.0245 | 24/24 | 7.7017, 7.8712, 7.9981 | 0.9950, 1.0245, 1.0411 |
| Pool | Raw-children128 | 8.7914 | 0.8502 | 24/24 | 8.7914, 12.6129, 8.5428 | 1.1991, 0.8502, 0.8419 |
| Pool | Text properties | 1.1968 | 1.0225 | 24/24 | 1.3295, 1.1034, 1.1968 | 1.0160, 1.0225, 1.0590 |
| Pool | Nested wrapping | 1.2674 | 1.0222 | 24/24 | 1.4257, 1.0149, 1.2674 | 1.2789, 0.9322, 1.0222 |
| Pool | HTML600 | 0.9989 | 1.0112 | 24/24 | 1.0515, 0.9536, 0.9989 | 1.0040, 1.0378, 1.0112 |
| Pool | SVG300 | 0.9718 | 1.0364 | 24/24 | 0.9718, 1.0331, 0.9126 | 1.1790, 0.9883, 1.0364 |
| Pool | Saved pages | 1.0071 | 1.0031 | 24/24 | 0.9961, 1.0282, 1.0071 | 1.0031, 0.9939, 1.0183 |
| Pool | Consumer19 | 1.0708 | 0.9722 | 24/24 | 1.0293, 1.0988, 1.0708 | 0.9073, 0.9722, 1.0198 |
| Native | First-read6000 | 7.2628 | 1.0337 | 24/16 | 7.7735, 7.2628, 6.8902 | 1.0149, 1.0525 |
| Native | Raw-children128 | 4.2421 | 0.7776 | 24/16 | 3.9866, 4.2563, 4.2421 | 0.6583, 0.8969 |
| Native | Text properties | 1.1575 | 1.0044 | 24/16 | 1.1575, 1.0740, 1.1902 | 1.0842, 0.9246 |
| Native | Nested wrapping | 1.2643 | 1.1285 | 24/16 | 1.3181, 1.2643, 1.2527 | 1.0703, 1.1866 |
| Native | HTML600 | 0.9444 | 0.9703 | 24/16 | 0.9444, 1.1121, 0.9111 | 1.0201, 0.9205 |
| Native | SVG300 | 1.0160 | 0.9381 | 24/16 | 1.0520, 1.0160, 0.9420 | 0.9088, 0.9673 |
| Native | Saved pages | 0.9927 | 1.0005 | 24/23 | 0.9691, 0.9927, 0.9970 | 0.9984, 1.0116, 1.0005* |
| Native | Consumer19 | 1.0012 | 1.0933 | 24/16 | 0.9770, 1.0012, 1.0528 | 1.1266, 1.0599 |

The first-getter groups consistently favor the bounded operand path. Raw-child
groups also improve substantially, but their controls drift materially. Text
and wrapping observations support the concrete reductions without precise
universal multipliers. Pooled HTML600 and saved pages are near parity; native
HTML600 is unfavorable, and pooled SVG300 also has an unfavorable median.
Those results and inconsistent controls prevent a full-scope non-regression
claim. No panel is rerun to replace them. [Correctness checks](../testing.md#012-read-path-follow-up)
are separate evidence.

## Full comparison at c807bdb

This earlier plan measures published 0.1.1 against
[`c807bdb`](https://github.com/website-local/grovedom/commit/c807bdbdc8a0396d8c55ef25de5ed1300cff03ba),
before the four read changes. It includes an identical-release control and
Cheerio 1.2.0 default/compatible htmlparser2 comparisons. Each of 32 panels uses
twelve fresh groups and eight mirrored blocks per comparison on Node 24.21.0.
Native published/local compiler differences remain a confounder.

It uses one independently initialized pair per process, low priority and the
same three-times-work rest policy. Startup, file I/O, warmup and verification
are excluded; recurring allocation, GC, parse, bindings, callbacks, output and
disposal are included. Corpora sum individual document intervals. Authored
warmups are 60 plus two sample-sized batches; consumer warmups are four plus
one batch, and corpus warmups are two plus one batch. Samples contain eight
HTML120 replays, four other authored replays or one corpus/consumer replay.
Every measured batch and final replay is checked; corpus phases are checked
per document. No idle admission, timing filter, normalization, replacement or
extension is used. The fixed ceilings are four reported CPU hours and 24 wall
hours. The focused run's automatic pause/resume leaves this plan unchanged.

**120/122 comparisons complete**, totaling **1,440 completed workers** and
**11,521/11,712 complete blocks**. The pooled real-page/Cheerio comparison stops
on its process-swap guard before a complete block; the native equivalent stops
after one block. Their remaining groups are skipped. No OOM event or output
mismatch is recorded. Every other comparison has twelve groups / 96 blocks.
Six incompatible htmlparser2 corpus/consumer combinations remain explicitly
excluded because their required outputs differ.

Ratios use the same geometric-block, median-of-group-medians estimator, without
an inherited historical speed gate or significance claim. "Complete" below
means the prescribed samples finished, not that an adoption gate passed.
Browser entries execute under Node, not in browser engines. The real corpus
contains 48 preserved pages; the synthetic corpus contains 44 inputs. Consumer19
uses the frozen older engine/MDN replay, not the current development consumer or
a live crawl. These workload weights are not production weights.

| Panel | Release / current | Identical control | Cheerio / current | Compatible htmlparser2 / current | Complete |
|---|---:|---:|---:|---:|---|
| Pool HTML120 | 0.9871 | 0.9976 | 5.3748 | 3.0442 | Yes |
| Pool HTML600 | 1.0061 | 0.9996 | 9.8771 | 5.7234 | Yes |
| Pool Sitemap600 | 1.0141 | 1.0133 | 5.0560 | 5.0141 | Yes |
| Pool SVG300 | 1.0096 | 0.9953 | 3.1964 | 3.3173 | Yes |
| Pool Ordinary API | 1.1901 | 0.9978 | 2.7822 | 2.9384 | Yes |
| Pool Until | 57.6053 | 0.9867 | 70.5969 | 68.3901 | Yes |
| Pool Attributes | 1.8661 | 1.0024 | 0.7547 | 0.5224 | Yes |
| Pool Contains | 8.9079 | 1.0038 | 3.0213 | 1.7862 | Yes |
| Pool Queries | 0.9892 | 0.9907 | 12.1650 | 10.9461 | Yes |
| Pool Forms | 1.0105 | 0.9790 | 0.9106 | 0.8918 | Yes |
| Pool Edges | 12.5853 | 0.9858 | 6.9294 | 2.0237 | Yes |
| Pool Real corpus | 1.0135 | 1.0097 | — | — | No |
| Pool Synthetic corpus | 1.2522 | 1.0046 | 1.6140 | — | Yes |
| Pool Consumer19 | 0.9974 | 1.0051 | 4.8637 | — | Yes |
| Native HTML120 | 1.0404 | 1.0278 | 6.7316 | 3.8283 | Yes |
| Native HTML600 | 1.0167 | 1.0039 | 10.3637 | 6.4487 | Yes |
| Native Sitemap600 | 1.0154 | 1.0210 | 5.2074 | 5.2731 | Yes |
| Native SVG300 | 1.0098 | 0.9855 | 3.3141 | 3.3895 | Yes |
| Native Ordinary API | 1.0637 | 1.0030 | 2.4527 | 2.4519 | Yes |
| Native Until | 92.3163 | 0.9931 | 105.3266 | 97.0293 | Yes |
| Native Attributes | 2.0651 | 0.9759 | 0.8727 | 0.6071 | Yes |
| Native Contains | 42.3529 | 0.9660 | 3.3522 | 2.1484 | Yes |
| Native Queries | 1.0089 | 0.9825 | 17.9206 | 14.7311 | Yes |
| Native Forms | 0.9905 | 1.0091 | 0.7787 | 0.7304 | Yes |
| Native Edges | 15.9172 | 1.0076 | 8.6862 | 2.6825 | Yes |
| Native Real corpus | 1.0446 | 1.0107 | 7.7072* | — | No |
| Native Synthetic corpus | 1.3093 | 1.0118 | 1.5886 | — | Yes |
| Native Consumer19 | 1.0081 | 1.0176 | 4.4729 | — | Yes |
| Browser entry HTML120 | 1.0075 | 0.9867 | 5.2681 | 2.8492 | Yes |
| Browser entry HTML600 | 0.9956 | 0.9889 | 9.9196 | 5.6623 | Yes |
| Browser entry Sitemap600 | 1.0041 | 1.0184 | 4.8801 | 4.8233 | Yes |
| Browser entry SVG300 | 0.9743 | 1.0058 | 2.9675 | 2.8399 | Yes |

The starred 7.7072 ratio is the single retained native real-page/Cheerio block,
not a completed comparison. Empty fast-parser cells are the declared exclusions.

Pooled HTML600 is near parity with 0.1.1: 1.0061, control 0.9996. Its twelve
candidate group medians span 0.9719–1.0540; control group medians span
0.9516–1.0768. The frozen consumer's 0.9974/control 1.0051 is also near parity.
Thus this run does not reproduce a sustained roughly 6% HTML600 regression,
but it does not establish its original cause or universal elimination.

The static traversal, attribute, containment and edge cases favor the API
changes. Attributes and forms nevertheless remain slower than both Cheerio
configurations, and the synthetic corpus is below 3×. Browser-entry SVG is
unfavorable against 0.1.1 and below 3× Cheerio. These observations, incomplete
real-page comparisons and unvalidated production weights keep adoption open.
Later read-change ratios must not be multiplied into this table.

## Reported CI after the wrapper change

A separate user-supplied CI benchmark follows the `c807bdb` push. It compares
current 0.1.2 with published Wasm 0.1.1 and Cheerio 1.2.0, using pooled heaps and
the shared browser workload under Node. The pasted table does not identify a
commit/artifact hash or Node version, provide raw/order observations, or report
the status of other CI jobs. Its association with the push is contextual.

| Case | Reference / current | Raw | Probe-filtered | Kept / complete |
|---|---|---:|---:|---:|
| articles-120 | released Wasm | 1.031× | 1.031× | 47/47 |
| articles-120 | Cheerio default | 3.938× | 3.938× | 47/47 |
| articles-120 | Cheerio htmlparser2 | 2.785× | 2.785× | 47/47 |
| articles-120 | identical Wasm control | 1.012× | 1.012× | 47/47 |
| articles-600 | released Wasm | 1.061× | 1.061× | 47/47 |
| articles-600 | Cheerio default | 6.615× | 6.615× | 46/46 |
| articles-600 | Cheerio htmlparser2 | 4.961× | 4.961× | 46/46 |
| articles-600 | identical Wasm control | 0.955× | 0.955× | 46/46 |
| sitemap-600 | released Wasm | 1.060× | 1.060× | 46/46 |
| sitemap-600 | Cheerio default | 4.419× | 4.419× | 46/46 |
| sitemap-600 | Cheerio htmlparser2 | 4.408× | 4.408× | 46/46 |
| sitemap-600 | identical Wasm control | 1.077× | 1.077× | 46/46 |
| svg-300 | released Wasm | 1.029× | 1.029× | 46/46 |
| svg-300 | Cheerio default | 2.980× | 2.980× | 46/46 |
| svg-300 | Cheerio htmlparser2 | 2.952× | 2.952× | 47/47 |
| svg-300 | identical Wasm control | 1.048× | 1.048× | 47/47 |

All 743 displayed complete blocks pass the probe filter. The medians favor
current, with HTML120's control closest to one. Other control offsets limit
precise gain claims; SVG remains just below 3× Cheerio. These reported figures
support retaining the wrapper change for an experimental patch. They do not
independently confirm a complete CI pass, explain the earlier slowdown or
override the separate local/server measurements.

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
