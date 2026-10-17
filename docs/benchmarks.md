# Performance evidence

The adoption target is **at least 3× current Cheerio** for the complete required
DOM workload, including bindings, callbacks, serialization and disposal, while
also beating the fastest compatible Cheerio/parse5 or htmlparser2 configuration.
Pooled Wasm on Node is primary. This is not a whole-downloader or browser claim;
production input weights remain unvalidated.

## Current result

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
