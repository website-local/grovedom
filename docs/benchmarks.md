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

The subsequent six-fix review has no conclusive elapsed-time result. Six fixed
native/pooled-Wasm panels attempted the authored HTML/XML/SVG workloads on Node
22/24 and a successful API workload on Node 22, with forty warmups, three groups
of four blocks, two batches of four replays, independent module graphs and two
identical-code controls. Every panel stopped at its declared host-activity limit.
Only thirteen of seventy-two planned blocks completed; eleven passed the
independent probe filter. Partial raw ratios ranged from 0.876 to 1.098, with
material control drift. These incomplete draft results do not pass a regression
screen and were not extended.

The final change then removed a draft parent lookup from every sibling insertion
callback, leaving detached-callback parity explicitly best-effort. In the
120-element API diagnostic, boundary calls were 1,940 before, 2,181 in that draft
and 1,941 after removing the lookup. The remaining extra call checks node kind
when assigning raw character data. The authored HTML120 replay stays at 255 calls.
These are operation counts, not elapsed speedups; the final adjustment was
correctness-tested without another timing campaign. Attribute creation preserves
exact interned names without changing ordinary reads or serialization.

## Relative-list resource correction

A later readiness review found that ordering a relative selector list queried
every descendant before filtering the matches in JavaScript. This registered
unrelated nodes and prevented their removed subtrees from being reclaimed until
document disposal. Ordering now uses only existing matched IDs: small unions
compare ancestry, while larger unions walk the tree without exposing more nodes.

With two matches and 20,000 unrelated nested element pairs, total returned IDs
fall from **40,013 to 12**, with eleven kernel calls in both versions. Eight
query/empty/refill cycles with 2,000 pairs produce these tracked capacities:

| Backend | Pre-fix candidate | Fixed candidate |
|---|---:|---:|
| Native | 10,977,504 bytes | 2,736,592 bytes |
| Pooled Wasm | 6,010,900 bytes | 1,566,468 bytes |

The fixed runs plateau; outputs match and both versions reach zero tracked live
bytes after disposal. These are backing-allocation capacities, not RSS or a
post-disposal leak. Each comparison uses matching JavaScript and C artifacts.

For 120 writes to one raw text handle, caching its immutable kind reduces kernel
calls from **240 to 121**. Each distinct written handle still needs its first kind
read: one write to each of 120 handles remains 240 calls. Cache hits flush pending
writes before coercion. These operation/resource probes make no elapsed-time,
universal non-regression or adoption claim.

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
suite or establish a production workload distribution.

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
the full correctness matrix and production adoption remain unverified.

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
seconds excluding download/initialization; actual browser-engine coverage is
still pending. The demo pins Cheerio's version in its jsDelivr URLs, but CDN
bundles can resolve transitive dependencies differently from CI's npm install.

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

Three measured passes after two warmups through the five-case offline consumer
panel produce 45 loads/disposals, 219 fragment parses, 16,386 repeated tag
predicates and 19,905 attribute observations. Native exclusive query/binding
shares are 37.7%/19.1%, compared with 0.33% fragment parsing. These instrumented
shares are not whole-pipeline or Wasm percentages; consumer URL processing is
also substantial. Predicate/input-transfer prototypes reduce calls but lack
full-scope timing acceptance. No allocator rewrite is justified by these results.

For authored bulk insertion, explicitly parsing once and cloning through the
existing API reduces fragment parses from 320 to four, adds 316 clones and keeps
163 arena backing requests. The fixed nine-block pooled screen gives
baseline/clone **1.4606**, control **0.9913**, all blocks quiet/retained.
This is an authored opportunity, not a consumer speedup or permission to cache
arbitrary mutation results. Use [fragment profiling](../bench/fragment-profile.mjs)
and [structural profiling](../bench/structure-profile.mjs) for attribution.

## Historical checkpoints

The architecture refactor passed its scoped 2% screen, with narrow XML/Node 24
headroom (0.9844, control 1.0059 in a separate eight-replay confirmation).
Earlier inconclusive affinity/control panels remain separate. The insertion
quality follow-up passed its saved-consumer screen (1.0034/control 0.9817) but
left ordinary insertion inconclusive (1.0132/control 0.9574).

### Scalar ASCII-scan confirmation

The compatibility follow-up against `e530f92` passed its scoped pooled-Wasm
screen: selector ratio/control **0.9802/0.9861**, consumer **0.9913/0.9841**.
All 18 blocks were retained and quiet; 100 warmups, three groups × three blocks,
two batches of eight selector or one consumer replay. Median/max batches were
5.2/8.3 and 26.7/51.0 ms. Raw/filtered aggregates agree; selector headroom over
0.98 is only 0.0002. Group candidate/control ranges were 0.955–1.120/0.925–0.996
and 0.988–0.994/0.979–1.031. This does not establish a universal speedup.

Bounded scalar reads reduced logical ASCII loads from 8,670 to 2,910 in the
selector diagnostic and 62,742 to 17,490 in the consumer diagnostic; neither used
Unicode fallback. The first prototype failed (0.9476, control 1.0041). Earlier
normalization/token experiments and their failed/inconclusive controls remain in
[experiment history](history/selector-experiments.md). Normalization stays in JS.

### Historical adoption evidence

Pre-refactor `b27dbe2` median ratios against Cheerio 1.2.0:

| Panel | Native | Pooled Wasm |
|---|---:|---:|
| Mixed HTML/XML | 5.804× | 5.400× |
| Nineteen-scenario consumer | 4.920× | 4.621× |
| Eight saved MDN pages, raw | 5.480× | 5.102× |

These passed scoped aggregate and faster-compatible-baseline checks; individual
SVG/XML margins were narrow. [Historical controls](history/benchmarks.md#wasm-first-investigation-after-2eef7b6)
do not establish current production weights, browser speed or whole-downloader gains.

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
