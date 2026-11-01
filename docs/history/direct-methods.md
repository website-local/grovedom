# Direct collection method loops

This 0.1.3 development change follows `dcf7e4a`. Six paths use direct IDs and
loops to reduce temporary selections, node wrappers and internal callbacks:

- `attr(map)` writes each element's attributes directly. Key enumeration stays
  per element because getters and value coercion can change the map.
- `prop(map)` writes ordinary and boolean properties directly. Structural/raw
  properties retain their existing setters through a lazily created selection.
- `has(nodes)` checks containment directly and stops after the first match.
  Node-array getters still run for each root; the string-selector path is unchanged.
- `closest(string)` matches and traverses ancestor IDs. Other selector types
  retain `is` semantics, including following a parent changed by a predicate.
- Whole-class `toggleClass()` and boolean overloads read and restore saved
  classes directly. Token and callback overloads keep the shared class helper.
- `wrap(string)` traverses and edits using reusable ID arrays. Callback/node
  wrappers and `wrapInner` keep their existing helper.

Actual caller callbacks, occurrence snapshots, retained identities, coercion
order and disposal checks remain. Internal `each` interception is outside the
[compatibility contract](../compatibility.md). No fast-mode API, declaration,
version or binary change is included.

The combined change adds **5,666 source JS bytes**, taking the 19 runtime files
from 117,052 to 122,718 bytes. Concatenating and gzip-compressing those files at
level 9 adds 961 bytes; this is a source-size diagnostic, not a package transfer
size. The Wasm binary remains 841,374 bytes.

## Combined method measurements

The preceding independent-variant survey supplied six leads that repeated on a
second saved MDN page. The new panel measures the **combined implementation**
against `dcf7e4a`: all 54 original method/overload cases, plus those six cases on
the second page. It preserves the original sources, round counts and exact
output/event oracles. It does not combine ratios from the two investigations.

Node 24.18.0, JIT enabled, pooled Wasm: each case has candidate/reference and
byte-identical reference/control comparisons, both import orders, four warmup
batches per graph and four mirrored groups per process. Each group visits both
implementations twice in opposite order. Separate runtime and workload module
graphs retain independent feedback. At most one document is live. All **240
processes, 3,840 timed batches and 1,920 warmup batches** complete with matching
outputs. There is no filtering, control normalization or forced GC.

Parsing, initial selection/handle preparation, output hashing and disposal are
outside these method timers. Mutation, required callbacks, internal allocation
and the final queue flush are inside. These results do not estimate full MDN
consumer speed. The original addClass cases re-add an existing token; map-values
has the same 128 initially cold handles in both implementations.

Ratios below are **candidate/reference elapsed**, lower is faster. Brackets are
the full observed eight-group ranges, not confidence intervals. Controls use
the same direction and are never correction factors.

| Path | Canvas ratio [range] | Canvas control | Array ratio [range] | Array control |
|---|---:|---:|---:|---:|
| `wrap(string)` | .447 [.332, .592] | .962 | .458 [.369, .545] | .889 |
| `attr(map)` | .638 [.362, 1.045] | 1.097 | .619 [.482, .681] | .998 |
| Whole-class toggle | .513 [.402, .557] | 1.016 | .514 [.490, .576] | 1.031 |
| `has(nodes)` | .452 [.286, .610] | 1.188 | .441 [.384, .570] | .945 |
| `prop(map)` | .589 [.521, .850] | .970 | .633 [.532, .697] | 1.044 |
| `closest(string)` | .607 [.462, .848] | .947 | .469 [.342, .523] | 1.025 |

Every Array group favors the candidate, corresponding to about 37–56% less
method time at the medians. Canvas attr-map favors six of eight groups; the
other five Canvas paths favor all eight. Controls and group ranges still vary.

The complete matrix also retains unfavorable results on unchanged paths:
filter-index is 1.169 (control 1.062), existing-token addClass is 1.156 (control
.982), wrapInner(string) is 1.154 (control .959), and prop(callback) is 1.041
(control .955). Other overloads are mixed. The unwrap fixture improves to .551
(control .984), but its timed wrapper construction now uses the faster string
wrap path; this is not an isolated unwrap implementation gain. No additional
callback or map rewrites are selected from these results.

## Full-workload panel

A separate fixed panel uses all four shared CI/demo workloads, full corpus
operations on three saved MDN pages, all 44 generated corpus cases eligible for
exact-output comparison, two dense/sparse selector diagnostics and all four
existing read fixtures. Four malformed XML/SVG corpus cases remain lifecycle
safety tests. These are library workloads, not the unchanged MDN crawler.

All comparisons use the Node byte path and preloaded inputs. Shared, saved-page,
generated-corpus and nested-wrapping replays include parsing, queries, callbacks
or edits, serialization and disposal. Corpus totals sum individual document
intervals, checking each output before continuing. Selector fixtures include
parse/query work and return counts. The first three read fixtures retain their
document setup/disposal exclusions.

Each comparison has both import orders, four warmup batches per graph and four
mirrored groups per process. Batches contain four HTML120/nested-wrap replays,
two HTML600/XML/SVG/selector replays, eight retained-read invocations, or one
saved-page/generated-corpus pass. An independent CPU probe runs before and
after samples, following 30 probe warmups. The secondary filter retains whole
groups only when probe max/min is at most 1.5. All raw results remain; there is
no elapsed-time filtering, control normalization or result-driven extension.

**90 processes, 1,440 timed batches and 720 warmup batches** complete. Every
measured output matches the frozen reference. Cheerio 1.2.0 default matches all
14 preflights. Its htmlparser2 entry differs on the three saved pages, generated
corpus and nested wrapping; their ten planned timing processes are explicitly
excluded as incompatible, not counted as successful comparisons.

Here ratios are **reference/current elapsed**, so above one favors current.
The identical control compares two `dcf7e4a` graphs. Cheerio columns are raw
medians; a dash marks an incompatible or out-of-scope comparison.

| Workload | Before/current raw | Probe-filtered | Kept/complete | Identical control raw | Cheerio/current | htmlparser2/current |
|---|---:|---:|---:|---:|---:|---:|
| Articles120 | 1.184 | 1.180 | 7/8 | 1.062 | 4.174 | 2.441 |
| Articles600 | 1.019 | 1.019 | 8/8 | 1.059 | 5.978 | 4.711 |
| Sitemap600 | .881 | .881 | 8/8 | .999 | 4.329 | 4.221 |
| SVG300 | .963 | .963 | 8/8 | .945 | 3.136 | 3.449 |
| Saved Canvas | 1.165 | 1.173 | 7/8 | 1.008 | 5.189 | — |
| Saved Pixel | .879 | 1.033 | 6/8 | .966 | 4.153 | — |
| Saved Array | .901 | .900 | 7/8 | 1.082 | 7.634 | — |
| Generated corpus44 | .977 | .986 | 1/8 | 1.017 | 1.859 | — |
| Sparse selectors | 1.040 | 1.040 | 8/8 | 1.077 | 4.328 | 2.293 |
| Dense selectors | 1.126 | 1.126 | 8/8 | .942 | 11.573 | 6.025 |
| First-read6000 | 1.219 | 1.219 | 8/8 | 1.048 | — | — |
| Raw-children128 | 1.106 | 1.106 | 8/8 | 1.108 | — | — |
| Text properties | 1.102 | 1.082 | 7/8 | 1.407 | — | — |
| Nested wrapping | 1.188 | 1.188 | 8/8 | .989 | 2.777 | — |

Full-workload results are mixed. Nested wrapping favors current in seven of
eight groups. Sitemap instead takes 13.5% more time at its median and is slower
in every group. Saved Array and Pixel also have unfavorable raw medians.
Substantial control/import-order drift, short XML batches and only one retained
generated-corpus group prevent a general non-regression or adoption claim.

## Bounded sitemap follow-up

The initial sitemap result remains in the table above. A separate four-process
check uses the same source with 16 replays per sample, eight warmup batches per
graph and six mirrored groups. It compares candidate/reference and identical
reference/control in both import orders, checking all 96 timed and 64 warmup
batches. No implementation change is made from this check.

Candidate/reference elapsed is **.998 [.692, 1.664]**, with **1.004 [.711, 1.336]**
for the identical control. Candidate import-order medians are .905 and 1.111;
seven of twelve groups favor the candidate and nine satisfy the probe filter.
The longer check does not repeat a stable overall slowdown, but its large
variation also cannot establish non-regression or erase the first panel.

Two separate 128-replay traces find `attr` bytecode increasing from 334 to 624
bytes and its interpreter frame from 80 to 160 bytes. Neither trace establishes
an `attr` inlining decision or a causal explanation for the timing difference.
These are diagnostic code-size observations, not speed measurements.

## Verification

The [new regression tests](../../test/direct-method-loops.test.mjs) cover key and
selection snapshots, nested coercion, partial effects, disposal, saved classes,
wrapper cloning, live ancestor traversal and node containment. All 40 also pass
on the unmodified reference. Review restored the disposal check after an empty
node-array getter, before final tests and measurements.

Every one of the 83 top-level Node test files runs in a separate bounded job,
with test concurrency one and JIT enabled. The final 2,602-case suites pass
**2,551 / 51 skips on pooled Wasm** and **2,539 / 63 skips on native**, with no
failures, cancellations or TODOs. The full 130,000-field test and four-worker
ownership checks retain their original sizes. Global/per-document Wasm and the
portable byte path each pass 52 focused loop tests under Node; these are not
new actual-browser measurements. Types, package versions and binaries are unchanged.

Runs use 64 MiB V8 old space and 4 MiB semi-space; worker checks use 32 MiB per
isolate. A serialized runner has a 45-second timeout and a 192 MiB sampled
process-group RSS stop. The latter is a polling guard, not a hard aggregate cap.
No timed/test run fails or triggers that stop. The main timing panel peaks at
122,784 KiB sampled group RSS. These observations do not qualify sustained
consumer memory. All 1,606 frozen source/input/dependency/harness files verify
after timing. The [full consumer performance target](../benchmarks.md) remains open.

## Reported CI after direct-loop integration

This receipt was supplied after the push of `291ad6a`, whose runtime is unchanged
from `d8ded63`. It compares current 0.1.3, published 0.1.2 and Cheerio 1.2.0 using
pooled heaps and the shared browser workload. No run link, artifact hashes or raw
blocks accompanied the table. Ratios are **reference/current**, so above one
favors current. This receipt does not confirm the other CI jobs.

| Case | Reference | Raw | Probe-filtered | Kept/complete |
| --- | --- | ---: | ---: | ---: |
| articles-120 | released Wasm | 1.100× | 1.100× | 81/81 |
| articles-120 | Cheerio default | 4.462× | 4.462× | 81/81 |
| articles-120 | Cheerio htmlparser2 | 3.062× | 3.062× | 79/81 |
| articles-120 | identical Wasm control | 1.025× | 1.025× | 81/81 |
| articles-600 | released Wasm | 1.072× | 1.075× | 79/81 |
| articles-600 | Cheerio default | 7.105× | 7.107× | 80/81 |
| articles-600 | Cheerio htmlparser2 | 5.434× | 5.435× | 79/81 |
| articles-600 | identical Wasm control | 1.029× | 1.029× | 80/81 |
| sitemap-600 | released Wasm | 1.047× | 1.047× | 81/81 |
| sitemap-600 | Cheerio default | 4.510× | 4.510× | 81/81 |
| sitemap-600 | Cheerio htmlparser2 | 4.530× | 4.532× | 79/80 |
| sitemap-600 | identical Wasm control | 1.054× | 1.054× | 79/80 |
| svg-300 | released Wasm | 1.049× | 1.049× | 80/80 |
| svg-300 | Cheerio default | 3.081× | 3.085× | 79/80 |
| svg-300 | Cheerio htmlparser2 | 3.080× | 3.080× | 80/80 |
| svg-300 | identical Wasm control | 1.039× | 1.039× | 79/80 |

The filter retains **1,278 of 1,290 supplied complete blocks**. All raw and
filtered Cheerio medians exceed 3×. Against the faster compatible Cheerio
configuration, filtered medians are 3.062×, 5.435×, 4.510× and 3.080× in case order.
The margins remain narrow on the smaller HTML and SVG workloads.

HTML release gains of 1.100×/1.075× exceed their 1.025×/1.029× control offsets.
Sitemap's 1.047× is below its 1.054× identical-code control; SVG's 1.049× is close
to its 1.039× control. The XML figures do not establish a precise attributable
gain. Controls are observations, not correction factors or confidence bounds.

This CI comparison uses published 0.1.2; the local combined-patch comparison
uses `dcf7e4a`. The new receipt does not isolate the six loops or resolve the
local sitemap slowdown. Dividing separate CI receipts would not supply a paired
incremental effect. All prior unfavorable results remain, and full consumer
performance/adoption remains unqualified.
