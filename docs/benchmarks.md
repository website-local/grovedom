# Performance evidence

Node with pooled Wasm is the primary target. The adoption requirement is at least
**3× current Cheerio** for the complete required DOM workload, including bindings,
callbacks, serialization and disposal, while also beating the fastest compatible
Cheerio/parse5 or htmlparser2 configuration. This is not a whole-downloader or
browser speedup claim. Production input weights remain unvalidated.

## Short checks

- Review previous results; fix inputs, parser options, groups and batch counts
  before timing. Do not extend a panel to obtain a passing result.
- Preload inputs; include recurring allocation, encoding, mutations, disposal and
  in-batch GC. Exclude startup, IPC, disk and network. Use matching release JS/binaries.
- Rotate/mirror implementations with an identical-code control, running one at a
  time. Check CPU/sibling activity before each block; read inherited affinity
  through `taskset`. Keep builds, tests and profilers out of timing windows.
- Preserve raw results. Filter whole blocks only on independent probe max/min
  above 1.5; never filter candidate times or normalize by the control.
- Report retained blocks, quiet prechecks, raw/filtered ratios and batch duration.
  Different protocols stay separate. Quiet prechecks do not rule out JIT/GC drift.

The scoped regression screen requires baseline/candidate medians ≥0.98 and
controls within 0.98–1.02. This tolerance does not prove exactly equal performance.
The current 0.1.0 regression investigation uses the median of three group
medians from three complete groups of four blocks, with at least three retained
blocks per group and ten in total. Both raw and filtered release/candidate and
before/candidate ratios must reach 0.98, with both controls within 0.98–1.02.
Historical panels retain their separately declared settings. Incomplete panels
and inconclusive controls do not pass.

## Consumer bottlenecks

The current five-case panel uses four MDN inputs and an authored sitemap through
an offline consumer pipeline. Native source timers, Node inspector and V8 tick
profiles consistently identify substantial consumer URL-processing cost. Within
GroveDOM, repeated predicates and attribute access are higher priorities than
fragment parsing or allocator changes.

| Three measured passes after two warmups | Observation |
|---|---:|
| Document loads / disposals | 45 / 45 |
| HTML fragment parses / default insertion contexts created | 219 / 3 |
| `is('a')` / `is('iframe')` calls | 11,214 / 5,172 |
| Attribute read/observe calls | 19,905 |
| JS→Wasm `gk_input` calls, current / private prototype | 67,152 / 33,822 |
| Query / binding-check exclusive native time | 37.7% / 19.1% |
| Fragment parse / allocation-free hook exclusive native time | 0.33% / 2.47% |

These are instrumented native shares, not whole-pipeline or Wasm percentages.
Operation counts agree across native/Wasm and outputs match the uninstrumented
reference. Inspector captures include replay verification; V8 tick captures also
include startup/warmup. Independent profiler elapsed times are not speedups.

Two private input prototypes remove the second Wasm call for short ASCII strings:
33,330 of 33,576 inputs in three consumer passes. An ASCII precheck avoids the
direct-write prototype's extra Unicode call. Both remain unproven by timing.

The [static and allocation review](history/performance-review.md) qualifies these
and the predicate/validator prototypes, rejects larger selector caches, and
records costs missed by the consumer profile. The reproducible
[`structure-profile`](../bench/structure-profile.mjs) diagnostic covers child
access, ancestry, overlapping roots, sibling traversal and attribute enumeration.
Runtime changes remain private where timing controls are incomplete.

The resumed input/validator candidate passed both pooled-Wasm HTML screens but
failed its XML sitemap before/after screen (0.9777, control 1.0024). SVG controls
and consumer completion remain unresolved. It was not promoted; the
[complete outcomes](history/performance-review.md#resumed-transfer-and-validator-screens)
preserve the earlier text-candidate failure and every stopped panel.

A later private input-descriptor variant has passing evidence for several
individual cases, including a longer-batch SVG confirmation. Four native
controls remain outside tolerance, and four pooled-Wasm cases lack complete
passing panels. This does not establish full-scope non-regression.

An earlier eight-case pool diagnostic observed six byte-limit retirements and
new instances over three passes. Raising the idle byte budget from 16 to 32 MiB
removed them, retaining 19.125 instead of 15.125 MiB; final passes had no growth.
This supports application-specific tuning, not larger defaults. Earlier native
allocation hooks occupied about 1.4–1.5% of timed DOM work; arena requests do not
count individual node allocations. No allocator rewrite is justified by these panels.

### Predicate locality experiment

A private two-answer cache for the most recently checked node reduced scalar
predicate binding calls from 16,386 to 11,364 over three consumer passes (30.6%),
with identical output. A one-entry simulation had no hits; larger caches added
little benefit. The candidate flushes before cached reads and invalidates on
rename/disposal; six focused tests passed on each backend.

It was **not retained**. The fixed repeated-predicate screen (100 warmups, three
groups × three blocks, two batches × eight replays) had raw candidate/control
ratios 0.9292/0.8198, only one retained block and no quiet prechecks. No group met
the minimum, so there is no filtered aggregate or proven speedup/non-regression.
Sustained host load prompted an early stop during the miss-only panel; the
consumer timing panel was not started. No replacement runs were added.

## Bulk insertion

The [fragment diagnostic](../bench/fragment-profile.mjs) compares repeated strings
with explicit parse-once/cloning through the existing API, for example
`$('article').append($('<i>text</i>'))`. Both strategies match Cheerio on the
authored 80-destination workload.

| Per replay | Strings | Parse once, then clone |
|---|---:|---:|
| Fragment parses | 320 | 4 |
| Insertion contexts created | 1 | 1 |
| Subtree clones | 0 | 316 |
| Arena backing allocation/reallocation requests | 163 | 163 |

A fixed pooled-Wasm screen used 100 warmups, three groups × three balanced
blocks, and two batches × eight replays per sample. Raw/filtered baseline/clone
ratios were **1.4606**, control **0.9913**; all nine blocks were retained and quiet.
Group ratios were 1.3623–1.4823, controls 0.9912–1.0276; median/max batches
4.49/5.63 ms. No extension or control normalization was used.

This is an authored bulk-insertion opportunity, not an MDN improvement or proof
that arbitrary mutation results can be cached. `html(value)` requires destination
context. The profiling pass changed no insertion behavior; matched native/Wasm
release builds were byte-identical, with no release Wasm diagnostic imports/exports.

## Regression checkpoints

### Investigation against 0.1.0 (open)

The private query-context candidate removes quadratic root-list scans: the
600-article replay performs 2,400 membership checks instead of 1,619,700, without
adding allocations. Scoped matching also uses indexed membership for ordinary
trees; template contexts retain an ID-list fallback to preserve Cheerio's order
and fragment boundaries. Correctness and sanitizer gates pass.

**Performance acceptance remains open.** A fixed six-panel comparison had five
inconclusive controls. The saved-MDN Wasm pipeline failed its screen at
0.9196 release/candidate, with control 0.9850. A subsequent common-path experiment
was inconclusive and discarded. These results do not establish non-regression
against 0.1.0. A measurement follow-up aligned warmup scheduling with samples and
removed repeated probe deoptimization; its six panels were still inconclusive.
A later complete quiet HTML120 panel failed at 0.9678 release/candidate with
valid control 1.0173 (all 12 blocks retained). The candidate improved the
pre-fix code by 1.0545, but a roughly 3.3% gap against 0.1.0 remains.
See the [full investigation](history/performance-review.md#query-context-regression-investigation)
for preserved outcomes, settings and profiling limits.

Subsequent private candidates also lack full-scope acceptance. The input
descriptor has a valid 2.7% HTML120 release regression; the constructor helper's
HTML results remain inconclusive. A scalar queue-copy prototype passes correctness
and exact-scope output checks but has not been timed. Allocator reuse and Wasm
tier interventions did not reliably stabilize identical-code controls. The
[current decision table](history/performance-review.md#current-decision) separates
these candidates and preserves the failed and incomplete evidence. No diagnostic
setting changes the default-runtime acceptance requirement.

### Corrected affinity and final confirmation

The architecture refactor's six-panel screen passed its declared tolerance.
Initial XML/Node 22, mixed/Node 24 and consumer/Node 24 passes were complemented
by the fixed confirmations below. All confirmation blocks were quiet and retained.
Earlier affinity selection considered only part of the inherited CPU set; those
observations remain valid for their selected CPUs, not silently discarded.

| Confirmation | Refactor ratio | Control | Result |
|---|---:|---:|---|
| Mixed / Node 22, one replay | 1.0047 | 0.9937 | Pass |
| Consumer / Node 22, one replay | 1.0242 | 1.0038 | Pass |
| XML / Node 24, one replay | 0.9681 | 0.9377 | Inconclusive |
| XML / Node 24, eight replays | 0.9844 | 1.0059 | Pass, narrow margin |

Each confirmation had three groups × three blocks and two batches/sample;
20 warmups for single replays, 100 for the separate eight-replay XML panel
(20.0/29.7 ms median/max batches). Raw and filtered ratios agree. Initial unresolved
candidate/control pairs were XML24 0.9724/0.9768, mixed22 0.9847/0.9762 and
consumer22 1.0353/1.0226; an additional XML24 confirmation was 0.9509/1.0804.
Those inconclusive protocols were not merged into the final screen.

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

### Insertion-context quality follow-up

The correctness fix against `9731b66` passed its saved-consumer screen
(**1.0034**, control **0.9817**) but left ordinary insertion **inconclusive**
(**1.0132**, control **0.9574**). Both used 100 warmups, three groups × three blocks,
two batches of one consumer or eight insertion replays. All 18 blocks were
retained, 17 quiet; raw/filtered aggregates agree. Median/max batches were
26.1/32.3 and 4.6/9.4 ms. Group candidate/control ranges were
0.978–1.005/0.962–0.992 and 0.949–1.020/0.947–0.971. Neither panel was extended.

Earlier selection/predicate changes reduced selection creation and result-array
returns, but their short timing controls were inconclusive. They establish count
reductions, not elapsed gains. They do not supersede the checkpoints above.

## Historical adoption evidence

Pre-refactor `b27dbe2` median ratios against Cheerio 1.2.0:

| Panel | Native | Pooled Wasm |
|---|---:|---:|
| Mixed HTML/XML | 5.804× | 5.400× |
| Nineteen-scenario consumer | 4.920× | 4.621× |
| Eight saved MDN pages, raw | 5.480× | 5.102× |

These passed scoped aggregate and faster-compatible-baseline checks; individual
SVG/XML margins were narrow. See [historical controls](history/benchmarks.md#wasm-first-investigation-after-2eef7b6).
Subsequent compiler/inlining/cache/layout candidates were not promoted because
results were mixed. Historical corpus results do not establish current production
weights, browser performance or whole-downloader speedups.

## Harnesses

- `bench/window.mjs --manifest=FILE --groups=1..3 --out=FILE`: bounded process
  comparisons, optional explicit init settings, 1–100 warmups and 1–8 replays/batch.
  Defaults to one host check and stops on busy activity (exit 2). Completed blocks
  are saved atomically after each block; stopped panels remain incomplete. The
  optional `--busy=pause --max-pauses=3` parks children during brief load spikes,
  waiting one second before a fresh host check. The fixed pause budget applies
  across the whole panel (0–10 pauses), never changes the sample count, and adds
  at most about two seconds per pause including the host check. Exhaustion stops
  incomplete; measured blocks are never repeated. Record this as a distinct
  protocol and keep earlier stopped panels closed. The
  explicit `--busy=run` retains the older retry-and-record behavior.
- `bench/phase-profile.mjs`, `bench/consumer-profile.mjs`,
  `bench/fragment-profile.mjs`: instrumented attribution, not acceptance timings.
- [Developer diagnostics](../diagnostics/README.md): allocation, lifecycle and
  synchronous operation collectors, excluded from published packages.
- `bench/run.mjs`, `bench/process.mjs`, `bench/short.mjs`: authored/historical
  harnesses; set bounded counts instead of repeating their longer defaults.

Native ticks are elapsed reference-clock ticks, not retired CPU cycles. WASI
imports, compiler features and heap defaults must be inspected independently of
benchmark ratios. Preserve raw profiles/manifests privately; public evidence
should contain workload scope, settings, outcomes and limitations.
