# Performance evidence

Node with pooled Wasm is the primary target. The adoption requirement is at least
**3× current Cheerio** for the complete required DOM workload, including bindings,
callbacks, serialization and disposal, while also beating the fastest compatible
Cheerio/parse5 or htmlparser2 configuration. This is not a whole-downloader or
browser speedup claim. Production input weights remain unvalidated.

## Hosted CI and browser demo

The diagnostic benchmark job reuses the verified current tarball and installs
the npm `latest` release into an isolated directory, with install scripts disabled.
It compares their pooled Wasm browser entries against pinned Cheerio's default
and htmlparser2 parsers. Both CI and the demo import `demo/workload.js` and
`demo/comparison.js`: 120 and 600 articles, a 600-entry XML sitemap and a
300-group SVG document. The shared workloads cover fresh parse, selection callbacks,
attribute edits, fragment parsing, traversal, removal, append, serialization and
explicit disposal. Local `test/fixtures.mjs` and `bench/xml-fixtures.mjs` reexport
the same HTML and XML/SVG workloads. Both XML cases use explicit XML mode.

The **whole benchmark job targets about two minutes**, starting at its first
step. Setup, artifact download, installation, initialization, warmup and all four
cases share that budget. Measurement ends 105 seconds after that first step,
reserving about 15 seconds for upload/teardown; a three-minute timeout covers
slow infrastructure. Build jobs and runner queue time are separate. Setup
exhaustion fails explicitly instead of starting another full timing interval.

Like the local `bench/short.mjs`, each paired block keeps both opposite-order
halves (ABBA/BAAB or BAAB/ABBA) together. Twenty warmup replays per case/variant
and 30 independent CPU-probe warmups precede measurement. Each sample times two
replays with disposal; exact output checks follow outside the timer. Each
reference is paired directly against current Wasm. A separate instance of the
identical Wasm module supplies an A/A control. The control also gets a byte-for-byte
copy of the complete JavaScript module graph. The former entry-only query string
shared helper modules with current Wasm: Node/V8 inspection found shared feedback
vectors and additional polymorphic call sites in `attr` and `find`, while the
release's helpers were separate. Copying all helper modules removes that asymmetry;
the inspection alone does not establish its elapsed cost or explain the earlier
regression ratios.

Instances have separate heaps, while runtime compilation caches and GC can still
affect this in-process diagnostic. It does not replace the longer fresh-process
acceptance protocol. Control source copying and initialization stay outside timing;
the browser demo and CI reuse the original Wasm bytes without rebuilding them.

Reports retain every raw and incomplete block. Whole complete blocks are
filtered only when the independent CPU-probe max/min exceeds 1.5. Raw and
filtered medians are medians of within-block paired ratios, with per-order
breakdowns. No ratios are normalized by controls. At least three complete blocks
per pair/case are required for a successful job; filtered counts and A/A results
remain visible even when inconclusive. A deadline may truncate the last block,
which stays in raw evidence and does not enter either median.

The probe keeps its arithmetic loop separate from its clock calls. This avoids
repeated V8 deoptimization at the loop exit: a 150-call diagnostic on each of
Node 22 and 24 observed 150 such exits before the change and none afterward.
This repairs probe execution; it does not explain the DOM regressions or change
the classification of earlier results.

Artifacts include exact package versions, Wasm hashes, the resolved dependency
lockfile and a job-summary comparison table. No quiet-host gate or speedup
threshold applies here. These shared-host diagnostics do not replace controlled
regression and adoption qualification below. The browser demo shares this
paired implementation with a thirty-second total budget, excluding downloads
and initialization.

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

Local screens in the 0.1.0 regression investigation use a **3% scoped
tolerance**: baseline/candidate medians ≥0.97 and controls within 0.97–1.03.
This is a practical screening tolerance, not proof of exactly equal performance.
Previously closed panels retain their predeclared 2% rules and classifications.
The initial short protocol uses the median of three group
medians from three complete groups of four blocks, with at least three retained
blocks per group and ten in total. Both raw and filtered release/candidate and
before/candidate ratios must reach 0.97, with both controls within 0.97–1.03.
Historical panels retain their separately declared settings. Incomplete panels
and inconclusive controls do not pass.

The later [best-effort selection](history/performance-review.md#best-effort-isolated-optimizations)
uses twelve fresh process groups and reports independently filtered p90/p95
elapsed times with uncertainty across processes. It attempts every planned panel,
allows up to ten minutes for sudden load to settle, and retains noisy controls
and unsuccessful trials. Its workload-specific findings do not reclassify the
earlier short screens or establish a universal speedup.

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

### Selected Wasm HTML writer

A fixed sixteen-panel comparison selected the HTML opening-tag span writer for
Wasm. On pooled Wasm's 600-article workload, filtered p90 time fell **7.8%** and
p95 fell **10.6%**. The before/candidate p90 ratio is **1.0842**, with a 95%
whole-process bootstrap interval of **1.0574–1.1285**; the paired median is
1.0649 and its identical-code control is 0.9972. All twelve process-group medians
improve, and the predeclared p90 test passes after correction across sixteen
panels. These percentiles describe fixed-batch amortized time per replay.

The browser entry's smaller HTML case also has adjusted statistical support,
but its tail control drifts enough to limit attribution. Native HTML has mixed
tails, so native retains its previous callback writer. The bounded XML-name
comparison and JSON attribute-span writer have no adjusted primary support and
are excluded from the selected runtime. The [complete comparison](history/performance-review.md#best-effort-isolated-optimizations)
includes every panel, unfavorable tails and control limitations.

A separate [broader-corpus check](history/performance-review.md#selected-writer-on-the-broader-corpus)
also supports p90 on all 44 successful seeded inputs: p90/p95 elapsed times
fall 4.2%/4.5%, with 172/192 retained batches per role and controls inside 3%.
The p90 ratio is 1.0433 (1.0059–1.0749), with corrected p=0.0313.
The 48-real-page panel remains incomplete after a memory-guard stop and shows
no supported tail improvement. Ordinary GC stays included; the smaller common
heap limit makes this a separate protocol from the sixteen-panel comparison.

The selected combination passes the expanded correctness, sanitizer, consumer
and memory checks. Its [completed twenty-panel comparison](history/performance-review.md#selected-runtime-in-the-original-scope)
against 0.1.0 and the preceding candidate retains 62.7% of batches. Six panels
pass both practical median screens, native HTML120 fails against the preceding
candidate, and thirteen are inconclusive. None meets every median and tail
criterion. The writer has workload-specific support; full-scope non-regression
remains unresolved.

An [isolated attribute-validator follow-up](history/performance-review.md#isolated-attribute-validator-with-shorter-batches)
uses shorter batches and releases verified corpus outputs between document
timers. All twenty-four panels complete; nineteen pass the practical median
screen and five are inconclusive. Median controls qualify in 23/24 panels, but
p90/p95 controls qualify in only 12/24 and 9/24. No panel meets the predeclared
primary gain criteria, so the validator stays private. The earlier Wasm writer
selection and unresolved historical panels retain their separate evidence.

A subsequent [raw node-kind cache trial](history/performance-review.md#raw-node-kind-cache)
targets repeated observations on the real/seeded corpora while preserving all
twenty original regression panels. Eighteen median screens pass and six remain
inconclusive, including one pooled real-page memory-guard stop. Pooled seeded
inputs have promising secondary results, but their p90 interval includes parity
and the four-test Holm p value is 0.126953125. No primary gain is supported;
the cache stays private and the selected runtime remains unchanged.

An [XML span follow-up](history/performance-review.md#xml-name-and-attribute-spans)
completes all 288 processes across twenty-four panels without a resource stop.
Eighteen practical median screens pass; six have insufficient retained data.
All aggregate median controls meet 3%, but only fifteen p90 and six p95 controls
do. Pooled SVG's before/candidate p90 ratio is 1.0490 (0.9865–1.0980), with
six-test Holm p=0.2197265625. No primary gain qualifies, so the span writer stays
private. A separate fix for quotes in raw XML attributes is retained after
correctness and resource qualification. Full-scope performance acceptance
remains open.

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
and exact-scope output checks; its complete HTML600 panel fails against 0.1.0
with valid controls. Allocator reuse and Wasm
tier interventions did not reliably stabilize identical-code controls. The
[current decision table](history/performance-review.md#current-decision) separates
these candidates and preserves the failed and incomplete evidence. No diagnostic
setting changes the default-runtime acceptance requirement.

The later [full-scope ASCII check](history/performance-review.md#resumed-binary-counts-and-full-scope-checks)
completed all twenty native, pooled-Wasm and browser-entry panels: five passes,
six failures and nine inconclusive controls, retaining 237 of 240 blocks.
Removing repeated whitespace-helper calls did not establish non-regression;
the experiment was rejected. The original index candidate remains unaccepted.

A later [class-operand candidate](history/performance-review.md#class-operands-and-portable-decoding)
attempted all twenty panels: six passes, one failure and thirteen inconclusive
results. Browser HTML120 fails at 0.9643 release/candidate with valid control
0.9916, despite passing Node HTML120 panels. Only eleven panels complete; the
interrupted and host-stopped panels stay incomplete. Reduced operation counts
and passing correctness checks do not establish full-scope non-regression.
The subsequent portable ASCII decoder loop removes small decoder calls but
raises sampled JS allocation by about 23% in both HTML sizes. It is removed;
both timing prerequisites stopped before collecting samples, so there is no
elapsed result for that experiment.

A private [HTML opening-tag writer](history/performance-review.md#html-opening-tag-writer)
removes about 7% of executed Wasm opcodes in both authored HTML sizes, with
unchanged XML/SVG counts and passing correctness, sanitizer, consumer and memory
checks. Both HTML120 timing prerequisites complete but have invalid controls;
the pooled panel also lacks sufficient retained blocks. The fixed sequence stops
with eighteen panels pending. That earlier checkpoint made no elapsed
speedup or full-scope acceptance claim; the later isolated comparison above
selects the writer for Wasm only.

A subsequent [bounded XML-name comparison](history/performance-review.md#bounded-xml-name-equality)
removes 6.53% of executed sitemap Wasm opcodes and 4.56% for SVG, with unchanged
HTML counts and passing full qualification. Its pooled sitemap screen passes
against both 0.1.0 and the preceding private candidate. The SVG control is outside
the 2% tolerance, so the fixed sequence stops with eighteen panels pending.
The combined candidate remains private and unaccepted; operation counts and one
passing panel do not establish full-scope non-regression.
A later ordinary-ASCII precheck increases XML/SVG operation counts and is removed
before elapsed timing. It adds no acceptance evidence or replacement panels.

A separate [broader-corpus follow-up](testing.md#broader-corpus-follow-up) adds
48 public response inputs and 48 seeded HTML/XML/SVG inputs. It retains selector
and traversal correctness fixes, and revisits two historical optimization leads.
Set-based until deduplication fails the short native real-page screen; a restored
JSON span writer has two short numerical passes and two inconclusive panels.
Neither establishes a repeatable gain or is promoted. The
[complete trial results](history/performance-review.md#broader-corpus-and-historical-lead-trials)
keep real and synthetic groups separate and preserve every failed/noisy panel.
These diagnostics do not replace the original twenty-panel acceptance scope.

A subsequent [correctness-candidate screen](history/performance-review.md#correctness-fixes-in-the-original-scope)
checks the repaired reference against 0.1.0 and the preceding XML-name candidate.
Both original HTML120 prerequisites complete, but pooled Node and browser-entry
controls are 0.9564 and 0.9769, outside the unchanged 2% tolerance. All 24 blocks
are quiet and retained; neither panel passes. The fixed stop leaves eighteen
panels pending, with no retries, transferred passes or runtime commit.

A separate [fixed-seed diagnostic](history/performance-review.md#fixed-seed-control-diagnostic)
also fails to stabilize both identical-code controls. The browser-entry control
is 0.9581 with fixed hash/random seeds despite quiet prechecks and full retention.
Runtime flags and the original acceptance requirements remain unchanged.

A fresh [reserved-window confirmation](history/performance-review.md#reserved-window-confirmation)
attempts all twenty panels with the same candidate and 2% rules: seven pass,
native SVG and the native template consumer fail against the preceding candidate,
nine have invalid controls, and both relative-colors panels reach their fixed
deadlines after one group. All 224 completed blocks have quiet prechecks; 222
are retained. The full goal remains unaccepted, with every earlier panel preserved.

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
  Defaults to one host check and a 15% CPU/sibling activity limit;
  `--max-busy-percent=30` explicitly allows activity up to 30% (range 0–100).
  The selected limit applies to initialization, every block and pause rechecks,
  and is recorded in settings and host reports. Treat a changed limit as a
  separate protocol; retain prior results. It does not change the independent
  probe filter or regression/control acceptance limits.
  Stops on busy activity (exit 2). Completed blocks
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
