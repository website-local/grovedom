# Static and allocation review

This review began with the runtime at `daa35b5`: ESM facade and transport, C kernel,
selector helpers, serialization, ownership and dependency entry points. It combines
source inspection with existing consumer profiles, new operation traces, V8 heap
sampling and authored scaling checks. It does not establish exhaustive coverage
or a new release speedup.

## Current decision

The investigation is active. Acceptance still requires all eight original
workloads on both backends, with the documented 2% tolerance and sufficient
identical-code controls. No private candidate below is promoted.

| Candidate or diagnostic | Current evidence | Decision |
|---|---|---|
| Input descriptor | Valid HTML120 release regression: ratio 0.9736, control 0.9996, all 12 blocks retained | Not accepted |
| Constructor helper | Valid native SVG before/after regression: ratio 0.9578, control 1.0168, all 12 blocks retained | Not accepted |
| Scalar queue copy | HTML120 passes; HTML600 fails against release at 0.9694 with valid control 1.0099; all 12 blocks retained in each | Not accepted |
| Proxy numeric-key guard | Initial scope: six passes, ten inconclusive/incomplete; fixed confirmation finds a valid pooled HTML120 failure against 0.1.0 | Not accepted |
| Hoisted attribute validator | Full scope: four passes, eleven inconclusive/incomplete, one valid native sitemap-pipeline failure | Not accepted |
| Distinct sibling query roots | Exact CI source has quadratic root-coverage scans; isolated fast path removes the query CPU hotspot and passes native/pool/sanitizer suites | Qualification and full-scope timing open |
| Allocator reuse / Wasm tier controls | Neither intervention reliably keeps identical-code timing within 2% | Do not change defaults or correct results using these diagnostics |

These are separate candidates and protocols: passes do not transfer between
them. Historical failed, incomplete and blocked checkpoints below remain
evidence and describe their state at that time, not an unfixable regression.

## CI large-HTML regression follow-up

The supplied CI summary reports released/current ratios of 0.938 at 120 articles
and 0.845 at 600: approximately 6.6% and 18.3% more elapsed time. Both retain
61/61 blocks, raw equals filtered, and identical-code controls are 1.003/0.986.
These shared-browser-entry diagnostics are distinct from prior private-candidate
Node-entry acceptance panels. The summary is preserved; its raw artifact has
not been independently audited.

Rebuilding the exact tested commit and profiling the browser entry at 600
articles identifies `gk_query` at 13.59–13.64% of samples, versus 2.82–2.99%
for published 0.1.0. The committed `gd_covered_root` scans the context list for
duplicates and each ancestor of every root, making the authored
`$('article').find('h2')` step quadratic. This code differs from the uncommitted
combined root/scope candidate previously measured locally.

A new isolated candidate certifies strictly monotonic, distinct sibling roots
in one pass and bypasses coverage scans for those roots. All other contexts
retain the existing fallback; no node layout, allocation, marks, or template
semantics change. New tests cover ordering, duplicates, arbitrary permutations,
reparenting and detached roots in HTML/XML. Its query sample share is
2.40–2.45%; all profiled replay outputs match. Native/pool suites pass
1,727/1,735 cases with 59/51 skips, and the native sanitizer suite passes with
leak detection and no reports.
Both 193-case consumer snapshots match outputs, events and lifecycle counts on
native and pooled Wasm. Seeded fuzzing passes 200 cases on each backend, as do
focused shared/fresh heaps, workers, Node 24, portable browser and type checks.

A fixed 60-second paired diagnostic shows a 1.1294 before/candidate ratio at
600 articles, but its identical-code control is 0.8821. That invalid control
prevents an elapsed improvement or acceptance claim. A separate JS/binary
crossover also has an invalid large-case control. Both remain preserved;
the mechanism and CPU attribution justify further qualification, not promotion.

A subsequent predeclared browser-entry HTML600 panel completes three groups of
four blocks, all retained, with 100 warmups and two batches of four replays.
Raw equals filtered: release/candidate 0.979082, CI-before/candidate 1.114005,
identical control 0.996960. Independent raw recomputation confirms the result.
This supports about 10.2% less elapsed time than the CI commit, but the candidate
still takes about 2.14% longer than release and fails the fixed 0.98 tolerance.
The sequence stops as declared; HTML120 remains unstarted. Neither rounding nor
the valid control converts this failure to a pass, and full-scope acceptance
remains open.

The subsequent full original-scope run completes all eight workloads on native
and pooled Wasm: eight passes, four failures and four inconclusive controls.
All 16 raw summaries independently recompute. Pooled HTML600 fails against
release (0.960358, before/candidate 1.095712, control 1.013614); pooled sitemap600
fails the filtered before/candidate ratio (0.973739, control 0.998998); pooled
template fails before/candidate (0.970233, control 0.989376); native SVG300 fails
both comparisons (release 0.976308, before 0.961373, control 0.993063).
Native HTML600 passes with release/candidate 1.049332 and before/candidate
1.237372. These workload-specific passes cannot promote a shared runtime change
that fails other required panels. The runtime candidate remains isolated.

## HTML allocation follow-up

Six separate Node/V8 heap captures cover pooled Wasm at 120/600 articles for
published 0.1.0, the working JSON-span candidate and the private input-descriptor
candidate. Each uses 20 warmups, GC before sampling, 40 replays and a 4 KiB
sampling interval, including objects collected by minor and major GC. Output
hashes match across all three variants at each size. These captures ran under
host load and provide statistical JS allocation attribution, not elapsed gains,
retained memory or Wasm allocation measurements.

Single-ID typed-array creation beneath `each` accounts for approximately 24–25%
of estimated allocation in all six captures; `attr` self allocation contributes
15–16%. Independent exact call tracing finds 240/1,200 `Uint32Array.of` calls in
node construction, plus one root array per replay. Every callback node is passed
to `$(this)`, which consumes its stable IDs: lazy creation alone would avoid none
of these arrays. Sharing a mutable callback array would break retained selection
snapshots. Alternative storage needs separate lifetime and retention analysis.

These costs also exist in 0.1.0 and do not establish a regression cause. Attribute
samples cannot distinguish regex objects from other allocations in that method;
the earlier validator experiment remains allocation evidence, not an accepted
performance fix. No runtime change follows from these captures alone.

An isolated callback-handle prototype replaces one-ID backing buffers with
one-element views of the selection's existing ID array. Source review confirms
that selection index assignment, splice and merge replace storage; focused
checks preserve callback snapshots through those edits and nested callbacks.
Separate allocation captures estimate 6.91/34.51 MB at 120/600 articles, compared
with 7.62/40.65 MB for the working candidate under the same sampling settings.
These are noisy statistical allocation estimates, not speedups or acceptance.

Unbounded sharing was rejected for promotion: after disposal and GC, retaining
one callback node from a 20,000-node query retains the entire 80,000-byte ID
buffer. The current one-ID record does not retain that query buffer. A WeakRef
probe verifies the additional retention; it does not measure total heap usage.
Any future sharing design must bound this cost for both handles and selections,
without moving equivalent allocations into disposal. The private prototype and
its unfavorable retention result remain preserved; no full correctness or
performance qualification is claimed for it.

A second private prototype stores HTML handle IDs in document-owned blocks of
32 slots. Each handle receives an immutable one-element view; slots are never
reused, and disposal clears the document's reference to the latest block.
Retaining one disposed handle and its selection after wrapping 20,000 nodes
keeps one 128-byte block, with the other 624 blocks collected. Sparse documents
pay for unused slots: one wrapped node reserves 128 rather than four backing
bytes, and every document has two additional bookkeeping fields. No ID block
is allocated until an HTML handle is created; XML record behavior is unchanged.

Under the same allocation-capture settings, estimated JS allocation is
6.75/35.11 MB for 120/600 articles, versus 7.62/40.65 MB before. Output hashes
match. This does not establish elapsed improvement or sparse-workload parity.
The prototype passes the 1,795-case suites on pooled Wasm (1,744 passes,
51 skips) and native (1,736 passes, 59 skips), focused shared/fresh heap and
Node 24 checks, portable browser fallback, and both 193-case output/event and
lifecycle replays on each backend. It remains isolated and unqualified by timing;
the native kernel is unchanged.

Exact block tracing confirms eight blocks / 240 views at 120 articles and
38 blocks / 1,200 views at 600; no-handle HTML and the XML sitemap create no
blocks. Separate sparse captures use 2,000 no-handle or one-handle documents,
and 40 XML600 replays. Their sampled totals vary by about −2.5% to +0.3%; these
single captures do not establish sparse allocation or elapsed parity. Heap
sampling also does not fully account for external ArrayBuffer backing storage.

A separate GC lifecycle probe retains 5,000 disposed one-node documents through
their handles. ArrayBuffer growth is 20,000 bytes before and 660,000 bytes with
blocks; after releasing the handles it returns to the pre-probe level in both
processes. Heap-used deltas are approximately 9.05/9.01 MB. These independent
snapshots include runtime bookkeeping, but expose a sparse backing-storage cost
that the heap samples alone miss. `external` includes `arrayBuffers` and must
not be added to it. The block prototype therefore remains a workload-dependent
tradeoff, with no accepted performance result.

The first fixed timing attempt for the block prototype used three groups of
four blocks, 100 warmups, two batches and an identical-code control, allowing
three pauses per panel. HTML120 used 16 replays per batch but stopped before
any samples. A diagnostic with the same four warmed, parked children then saw
four quiet windows and zero child CPU ticks; it did not collect timings.
The previously unstarted HTML600 panel used four replays per batch and retained
11 quiet blocks before a load spike stopped its final block. Its complete-group
release/before/control ratios were 0.9764/0.9735/0.9372 and
0.9562/0.9281/0.9768; the incomplete third group's ratios were
0.9363/0.9990/1.0707. Median batches were 28.75 ms. Neither panel has an
aggregate acceptance result, and no replacement blocks were added. These
unfavorable partial ratios remain evidence; allocation savings did not establish
elapsed improvement.

A later explicitly identified idle window allowed both new block-prototype
panels to finish, followed by a separate input-descriptor HTML120 panel. All
36 blocks were quiet and retained, with unchanged group counts, filtering and
control limits. Raw and filtered aggregates agree:

| Candidate / pooled Wasm | Release / candidate | Before / candidate | Control | Outcome |
|---|---:|---:|---:|---|
| ID blocks, HTML120 | 1.0279 | 1.0493 | 0.9737 | Inconclusive control |
| ID blocks, HTML600 | 0.9356 | 0.9709 | 0.9863 | Failed both regression gates |
| Input descriptor, HTML120 | 0.9455 | 0.9827 | 1.0358 | Inconclusive control |

Batch median/max durations were 23.21/34.39, 27.87/40.85 and 23.43/38.23 ms,
respectively. The ID-block candidate is rejected for promotion: its complete
HTML600 screen is approximately 6.9% slower than release and 3.0% slower than
before, with a valid aggregate control. Heap allocation savings do not outweigh
that failed elapsed screen. The descriptor's original HTML120 requirement
remains unresolved; quiet host checks alone did not produce stable controls.
Earlier incomplete panels remain separate and were not extended or combined.

After a scheduled four-hour wait, a fresh quiet-window input-descriptor HTML120
panel completed all 12 quiet, retained blocks. Raw/filtered release/candidate,
before/candidate and control ratios were 0.9736, 1.0053 and 0.9996; batch
median/max was 22.77/29.01 ms. This is a valid-control failure against release,
approximately 2.7% slower, not merely another inconclusive host window. The
predeclared remaining-case sequence stopped on that failure.

A subsequent isolated attribute-helper experiment moved object and callback
handling out of `attr`. V8 bytecode no longer creates a function context at
method entry (315 versus 326 bytecode bytes), while regex handling is unchanged.
The full pooled-Wasm suite passes 1,743 cases with 51 skips. However, warmed
allocation captures estimate 8.00/40.92 MB before and 8.07/40.15 MB after at
120/600 articles, providing no clear allocation gain. Its fixed HTML120 timing
panel stopped before samples after the pause budget; HTML600 did not start.
The prototype remains private and unqualified. Bytecode context removal alone
does not establish an optimized-code allocation or elapsed benefit.

A 12-block quiet instrumented HTML120 panel narrowed the investigation to
query and observation boundaries, but did not isolate one dominant cost. The
code-replacement phase had material identical-code control drift. Exact kernel
counters subsequently confirmed that phase names do not identify exclusive
operation costs: `remove` flushes the last HTML replacement and queues removal;
`headings` executes the 120 removals; serialization also executes footer insertion.
These diagnostics preserve the original flush boundaries and are not acceptance
measurements.

A private sibling-context prototype skips ancestor coverage walks when all
query roots have the same non-null parent. Duplicate handling remains intact;
mixed and overlapping roots retain the existing path. Matching Wasm counters
show 64/256/1,024 ancestor checks become zero for 16/64/256 sibling contexts,
while overlapping-root checks remain 19/67/259. Other counted kernel work and
boundary calls are unchanged. Native and pooled-Wasm suites, native sanitizers
and allocation-failure checks, both 193-case consumer replays on both backends,
seeded fuzzing, and focused heap/worker/browser/type checks pass. No elapsed
gain or promotion is claimed. Published 0.1.0 did not perform the covered-root
scan; improvements over the intermediate quadratic implementation alone cannot
establish parity with that release.

A separate private Wasm code-generation experiment splits the ASCII whitespace
check from the full ECMAScript whitespace helper. Release disassembly shows
class/token matching previously called the helper for each scanned byte; the
candidate keeps ASCII checks inline. HTML120 executes 2,760 such checks, all
ASCII. The installed 193-case consumer replay executes 417,663,989 whitespace
checks, of which 13,473 start with non-ASCII bytes. Some summary scanning was
already inline in the baseline, so this total is not a count of removed calls.
Outputs, lifecycle metrics and instrumented counts match before and after.
Native already inlined the ASCII checks, so its elapsed effect must be assessed
separately. Full native/pool suites, native sanitizers and fault checks, both
consumer snapshots on both backends, seeded fuzzing and focused compatibility
checks pass. Release Wasm grows by 135 bytes. This experiment is independent of
the sibling-context candidate.

After the longer wait, its fixed HTML120 panel completed all 12 quiet, retained
blocks. Raw and filtered release/candidate, before/candidate and control ratios
were 0.9767, 1.0134 and 0.9873. Batch median/max was 23.00/39.16 ms. The control
passes, but the release regression remains approximately 2.4%, outside the 2%
tolerance. Individual before/candidate group ratios span 0.9898 to 1.0455; fewer
helper calls do not establish a repeatable incremental speedup. This candidate
is not promoted and does not resolve the full original comparison scope.

A further isolated JS experiment constructs each HTML handle's existing
one-element `Uint32Array` by length and assigns its ID, replacing `.of(id)`.
Storage size, independent snapshots and the XML lazy-ID record implementation
are unchanged, but the surrounding constructor's control flow changes.
V8's optimized handle constructor switches from `TypedArrayOf` to
`CreateTypedArray` plus an indexed store; caller code grows from 808 to 900 bytes
in this diagnostic. Allocation sampling shows no clear reduction. Full native
and pooled-Wasm suites, both consumer snapshots on both backends, seeded fuzzing
and focused heap/worker/browser/type checks pass. No C or artifact changes were
needed.

Its fixed pooled-Wasm HTML120 panel retains all 12 blocks and passes narrowly:
raw/filtered release/candidate 0.98085, before/candidate 1.00689, control 0.99822.
HTML600 retains 11 blocks but is inconclusive: raw/filtered release/candidate
1.02382, before/candidate 1.00291/1.01182, control 0.97028. The subsequent native
HTML120 panel stops after one complete group; the remaining 13 original-scope
panels are unstarted. This is one scoped pass, not full acceptance or a claimed
universal speedup. The candidate remains private; no partial groups are combined
and no unfavorable panels are discarded.

After the deferred continuation, four more native panels pass with all 12 blocks
quiet and retained (raw and filtered ratios agree):

| Workload | Release/candidate | Before/candidate | Control |
|---|---:|---:|---:|
| HTML600 | 1.05758 | 1.07826 | 1.00575 |
| Sitemap600 | 1.04658 | 0.99659 | 1.01635 |
| SVG300 | 1.02823 | 1.00853 | 0.98921 |
| getPose consumer | 1.03738 | 1.00903 | 1.00530 |

The native relative-colors consumer panel stops before its third group after
retaining eight blocks in two complete groups. No aggregate acceptance result
is computed; its observed batch median/max is 207.72/291.31 ms. The next eight
panels remain unstarted. The candidate therefore has five scoped passes, three
inconclusive/incomplete entries and eight unstarted entries across the original
16-case scope. All five new raw summaries reproduce under the unchanged gate
calculator. There is still no promotion or full acceptance claim.

The next deferred sequence completes four more 12-block panels with valid
controls and no filtering differences:

| Workload | Release/candidate | Before/candidate | Control | Result |
|---|---:|---:|---:|---|
| Native template consumer | 1.11421 | 1.00040 | 1.01166 | Pass |
| Native sitemap pipeline | 1.05692 | 1.03254 | 0.98396 | Pass |
| Pooled Wasm sitemap600 | 0.99039 | 0.98606 | 0.99039 | Pass |
| Pooled Wasm SVG300 | 1.02586 | 0.96577 | 1.00352 | Fail before/after |

The sequence stops at the SVG failure: approximately 3.5% slower than the prior
candidate, despite passing the release comparison. Its batch median/max is
22.05/35.70 ms. The candidate is not promoted. The full scope now contains eight
passes, one failure, three inconclusive/incomplete entries and four unstarted
consumer entries. A subsequent XML-only code-generation diagnostic confirms
the rewritten constructor generates different optimized code (668 versus 692
bytes), without an observed deoptimization in that capture. Code size alone
does not explain the elapsed regression; the XML lazy record's unchanged source
does not establish unchanged execution cost for its surrounding constructor.

A separate helper variant restores the original ternary assignment and moves
HTML ID construction into a helper. Its optimized XML constructor returns to
692 bytes with the same normalized instruction shape as the baseline; feedback
metadata and source offsets still differ. HTML uses `CreateTypedArray`, with
1,012 bytes of caller code. All previous correctness gates pass on this variant;
no C or artifact change is involved.

Its four fixed screens produce these raw/filtered ratios:

| Workload | Release/candidate | Before/candidate | Control | Result |
|---|---:|---:|---:|---|
| Pooled SVG300 | 1.01049 | 1.02840 | 1.00923 | Pass |
| Pooled HTML120 | 1.03454 | 1.04359 | 0.96376 | Inconclusive control |
| Pooled HTML600 | 0.99044 | 1.02512 / 1.04331 | 1.03164 / 1.03619 | Inconclusive control |
| Native HTML600 | 0.92278 | 0.93508 | 1.07387 | Inconclusive control |

All groups complete; HTML600 pool retains 11 blocks, the others 12. The helper
passes the formerly failing SVG screen, but control drift prevents judging its
HTML behavior. Neither favorable nor unfavorable apparent HTML changes qualify.
The helper is not promoted, and earlier variants' passes do not transfer to it.
Further work must address process-to-process measurement variation before
interpreting additional small changes as performance improvements.

### Timing variability

A saved-sample audit found substantial within-group variation as well: the
native HTML600 control's block ratios ranged from 0.855 to 1.289 while paired
CPU probes remained near parity. A separate, predeclared identical-code native
HTML600 diagnostic then collected GC events and resource counters outside its
timed regions. All 12 blocks completed and were retained. Across 192 batches,
elapsed time ranged from 20.92 to 36.27 ms. The observer recorded 312 GC events,
but none overlapped a timed batch; this capture does not support direct GC
pauses as the explanation.

Batch duration correlated moderately with reported minor page faults (0.477).
The lowest and highest fault-count quartiles had median counts of 172 and 780,
and median durations of 22.15 and 25.13 ms. This is descriptive association,
not causal attribution: allocator, heap and page behavior need further
investigation. No samples were removed or adjusted using these records, and
the instrumented diagnostic is not acceptance evidence. Quiet CPU probes alone
do not bound this allocation-heavy workload's variation to the 2% tolerance.

A later read-only audit checks CPU changes in ten saved panels, keeping each
panel and identical-code pair separate. Most blocks move from the CPU used for
warmup or the preceding block, but unmoved blocks also have substantial control
offsets: examples include 0.874 on pooled HTML120 and 0.855 on native HTML600.
The few unmoved blocks are not a randomized comparison, and CPU selection is
confounded with host load. Migration alone therefore does not explain the
observed spread; this audit neither changes affinity policy nor filters samples.

Fault-only phase captures then ran six fresh processes per backend, each with
100 warmups and 16 batches of four HTML600 replays. Native process medians range
from 172 to 1,180 faults per batch; parsing and serialization account for about
88% of counted faults. Pooled Wasm medians stay at 173–174, with nearly all faults
in serialization. Outputs match and original flush boundaries are preserved.
These are count captures, not elapsed comparisons.

A separate native diagnostic adds process-wide fault deltas to selected C
profiling scopes. Across six further fixed captures, binding-output medians
stay at 172–173 faults per batch, while kernel parsing medians range from 0 to
340 and HTML-read medians from 0 to 288. This narrows the variable component to
native kernel work rather than the binding's relatively stable result-copy
component. The counters can include concurrent runtime activity; instrumentation
may also perturb allocation state. They do not identify a specific allocator
policy, prove a causal speedup, or justify excluding samples. Release artifacts
and runtime allocation policy remain unchanged.

Read-only allocator snapshots further show that identical native processes can
follow different reuse patterns. In some fixed captures, malloc arena capacity
grows during parsing and shrinks on disposal on every batch; others show no
such changes. A child-local trimming-threshold intervention stops those arena
shrinks but leaves extra faults as allocations shift to mmap-accounted storage.
This unsuccessful single-setting intervention is retained with the raw data.

A second, separately declared diagnostic suppresses both release routes in six
disposable processes. All six then have zero median faults in kernel parsing
and HTML serialization, and total batch medians of 172–174 faults. Binding-output
medians remain about 172. This supports allocator release/reuse behavior as a
contributor to the native fault variation. These child-local allocator settings
are experimental controls, not library defaults or acceptance conditions; no
timing gain is established and no global configuration is changed. The evidence
does not explain all pooled-Wasm control drift or complete the original gates.

A fixed timing follow-up does not establish repeatable control stabilization.
All four children run identical native release code without profiling. The
first default-policy panel stops incomplete; the three remaining panels finish:

| Allocator condition | Retained blocks | Designated control, raw / filtered |
|---|---:|---:|
| Reuse, first panel | 11 / 12 | 1.00578 / 0.99270 |
| Reuse, second panel | 12 / 12 | 0.96496 / 0.96496 |
| Default, final panel | 12 / 12 | 0.97793 / 0.97793 |

These use three groups of four blocks, 100 warmups and two batches of four
HTML600 replays. Each completed panel has at least one of its six pairwise
controls outside 2%. The original default/reuse/reuse/default sequence remains
incomplete; neither the missing panel nor unfavorable controls are discarded.
Reducing fault counts therefore does not by itself provide stable timing.

A separate pooled-Wasm compilation audit uses the preserved IPC replay path,
with synchronous stage markers and V8 optimization logs. Three fresh processes
per size and condition perform four sample requests after warmup, each with two
batches of 16 HTML120 or four HTML600 replays. These are diagnostic traces under
host load, not acceptance timings. Output hashes match release and candidate.

| Warmups | Version | Wasm compilations logged after warmup, HTML120 / HTML600 |
|---|---|---:|
| 100 | Published 0.1.0 | 10 / 3 |
| 100 | Private constructor helper | 11 / 2 |
| 1,000 | Published 0.1.0 | 6 / 0 |
| 1,000 | Private constructor helper | 6 / 0 |

Each count repeats across all three processes. After 100 warmups, JavaScript
`input` and/or `result` optimization also completes in some sample intervals;
none is logged after 1,000 warmups. No post-warmup deoptimization is logged.
The later Wasm compilations include parser, selector and lifecycle functions.
Even 1,000 warmups do not finish all observed compilation for HTML120. Concurrent
compiler logging and tracing overhead prevent exact timed-batch attribution,
and similar activity exists in the published release. This identifies an
uncontrolled runtime phase, not the cause or size of the regression. No samples
are removed, timing gates changed, or production compiler policies overridden.

Within each condition, the same Wasm functions finish compiling in the same
sample request across all three processes. That consistency does not explain
identical-process timing spread by itself; JavaScript completion placement varies
in a few captures. A separately declared six-process diagnostic uses V8's
`--no-liftoff` flag only in child processes. At 100 warmups it logs no later Wasm
compilation for either size, with matching outputs, but still logs later
JavaScript optimization. This provides a way to isolate Wasm tier transitions
in a future control comparison, not a recommended runtime setting or measured
performance improvement.

The subsequent fixed timing comparison uses four identical pooled-Wasm children:
two with default compilation and two with the diagnostic optimizing-only policy.
Both HTML panels retain all 12 blocks, using the same three-group protocol and
100 warmups, with two batches of 16 or four replays for HTML120/600. Default-policy
controls are 1.00510/1.00639; optimizing-only controls are 1.03016/0.99987. Raw and
filtered aggregates agree. Thus removing the observed Wasm tier transitions
does not reliably stabilize controls either. Cross-policy elapsed ratios are
diagnostic, not adoption evidence; production settings remain unchanged.

A separately declared default-runtime confirmation then completes HTML120 with
release/candidate 0.98801, before/candidate 0.97454 and control 1.03980. All 12
blocks are retained, but the invalid control makes the result inconclusive.
HTML600 stops on load before collecting samples; the planned native HTML600
confirmation is unstarted. Earlier panels remain closed and unmerged, and the
original sixteen-case acceptance requirement remains unresolved.

### Scalar command-ID copy

A private queue-copy prototype, independent of the constructor helper, replaces
the general typed-array copy with an indexed load/store when a command has one
node ID. Exact counts are 481 scalar / four bulk copies for HTML120, 2,401 / four
for HTML600, and 48,149 / 61 across the installed 193-case consumer replay.
Generated code bypasses `TypedArrayPrototypeSet` for scalar copies and retains
bounds checks, but the optimized function grows from 5,412 to 5,736 bytes. These
are call counts and code shape, not allocation savings or measured speedups.

The prototype passes native/pool suites, both 193-case consumer snapshots on
both backends, seeded fuzzing, and focused heap/worker/browser/Node 24/type checks.
Only the JS queue copy changes; native artifacts remain unchanged. An initial
native test run used an incompatible Wasm path in cross-backend initialization
tests; its failed log is retained and the full run with matching artifacts passes.
The prototype remains private; its completed HTML timing screens are below.
An output-only check also matches published 0.1.0 and Cheerio on all eight
original workloads on both backends, preserving the original inclusion set;
the ninth excluded case matches Cheerio too. This is not timing acceptance.

### Separate 30% activity protocol

A separately declared continuation raises the host CPU/sibling precheck limit
from 15% to 30%. It keeps the three groups of four blocks, 100 warmups, two
batches, fixed replay counts and three-pause budget. The independent 1.5 probe
filter and raw/filtered 2% regression and control limits are unchanged. Earlier
panels remain closed; results are neither merged nor control-normalized.

The scalar queue candidate completes both pooled HTML panels, retaining all 12
blocks each. HTML120 passes at release/candidate **1.00822**, before/candidate
**1.02676**, control **1.01425**. HTML600 fails at **0.96942**, **1.00549** and
**1.00987**, respectively. Raw and filtered results agree. The last HTML600 block
has a 17% precheck, admitted by the new protocol. The queue change alone is not
sufficient to resolve the release regression; no further cases run after failure.

The separate constructor helper then runs previously unstarted scope panels:

| Pooled case | Release/candidate raw / filtered | Before/candidate raw / filtered | Control raw / filtered | Retained | Decision |
|---|---|---|---|---|---|
| Sitemap600 | 0.99837 | 1.00836 / 0.99911 | 0.98073 / 0.98601 | 11 | Pass |
| getPose | 1.03658 | 1.02325 | 0.97031 | 12 | Inconclusive |
| Relative colors | 1.05883 | 0.98418 | 1.01661 | 12 | Pass |
| Template | 1.06317 / 1.06903 | 1.02338 / 1.03808 | 0.98500 / 0.97800 | 11 | Inconclusive |
| Sitemap pipeline | 1.08738 | 0.99155 | 0.97054 | 12 | Inconclusive |

Single ratios mean raw equals filtered. Each inconclusive completed panel has
an invalid control. Native HTML120 completes one four-block group, then exhausts
the pause budget before the second group's initialization (36% activity at the
final check); it has no aggregate result. Seven planned native panels remain
unstarted in this sequence, including the earlier inconclusive HTML600 case.
Across the original sixteen cases the helper therefore has three scoped passes,
seven inconclusive/incomplete cases and six never attempted. No full-scope
acceptance is claimed. A separate output-only audit matches both published
0.1.0 and Cheerio on all eight original cases per backend, and also matches
Cheerio on the ninth historical exclusion; this does not establish timing.

A later scheduled native continuation completes three helper panels. HTML600 and
sitemap600 remain inconclusive because their controls fail. Native SVG300 fails
with a valid control: release/candidate **1.00162**, before/candidate **0.95779**,
control **1.01681**, all 12 blocks retained and raw equal to filtered. This is
about 4.4% slower than the preceding candidate. The sequence stops, leaving four
native consumer cases unstarted; the helper is not accepted.

### Selection property-key guard

A separate private candidate checks the first ASCII digit before applying the
numeric-index regex in the selection proxy's get trap. Other traps and receiver
forwarding are unchanged. Exact counts show 728/3,608 ordinary property reads
for HTML120/600, none numeric. The installed consumer replay has 529,550 string
reads, of which 41,811 are numeric: the guard can avoid 487,739 regex calls in
this trap. These are call counts, not allocation savings or elapsed gains.

The method-only optimized getter grows from 320 to 560 bytes. A separate mixed
access trace covers numeric/non-numeric keys and 240 complete HTML replays;
both baseline and candidate deoptimize on the newly introduced access pattern
and reoptimize. Shorter or longer generated code alone does not predict speed.
Focused checks preserve leading-zero properties, symbols, getter receivers and
index mutation on both backends. Native/pool suites, both 193-case offline
consumer snapshots, seeded fuzzing, focused heap/worker/browser/Node 24/types
and exact original-scope outputs pass. An initial scratch suite lacked two
harness directories; its failure is preserved and the complete-copy suite passes.

Fixed panels use the separate 30% activity protocol above; all retain 12 blocks.
Raw and filtered ratios agree:

| Case | Release/candidate | Before/candidate | Control | Decision |
|---|---|---|---|---|
| Pooled HTML120 | 0.99478 | 1.01973 | 0.96672 | Inconclusive |
| Pooled HTML600 | 0.98926 | 1.02104 | 0.98620 | Pass |
| Native HTML120 | 0.99727 | 0.99792 | 0.98272 | Pass |
| Native HTML600 | 0.99277 | 1.02032 | 0.98304 | Pass |
| Pooled sitemap600 | 0.99549 | 0.98861 | 0.99529 | Pass |
| Pooled SVG300 | 0.98266 | 1.01281 | 1.02798 | Inconclusive |
| Native sitemap600 | 1.00193 | 1.00379 | 0.94568 | Inconclusive |
| Native SVG300 | 1.04008 | 1.01571 | 0.97180 | Inconclusive |
| Native relative-colors | 1.08286 | 1.00512 | 0.99449 | Pass |
| Native template | 1.10823 | 0.98431 | 1.00776 | Pass |
| Native sitemap pipeline | 1.01921 | 1.02610 | 0.95658 | Inconclusive |

The completed inconclusive panels have invalid controls. A subsequent pooled
getPose panel exhausts its pause budget before collecting samples, leaving seven
original cases unstarted. The next pooled relative-colors panel stops after two
blocks. A deferred pooled template panel stops after three blocks in its first
group when activity exceeds 30%; its partial control does not qualify a panel.
The following pooled sitemap-pipeline panel stops at its initial activity check
without samples. Four native cases remain unstarted. These stops leave four
scoped passes and eight inconclusive/incomplete cases. An opportunistic native
getPose attempt then stops after two blocks when activity rises above the limit;
it leaves nine inconclusive/incomplete cases and three native cases unstarted.
Those three cases then complete all 12 blocks each: relative-colors and template
pass, while sitemap pipeline has an invalid control. Template is about 1.6%
slower than the pre-change candidate, within the scoped 2% tolerance; it is not
an incremental speedup. All 16 original combinations are now attempted, with
six passes and ten inconclusive/incomplete results. Every raw summary was
recomputed; incomplete groups were not extended or merged.
Passes from other candidates do not transfer.
No production change or general speedup is claimed. Authored 24-cycle memory
budgets and fixed pinned-owner/replacement checks pass on native and all three
Wasm heaps; final tracked live bytes and document counts are zero.

A predeclared, separate confirmation sequence covers the ten unresolved cases,
with pooled cases first and unchanged candidate, artifacts and panel settings.
Its first HTML120 panel retains all 12 blocks: raw and filtered release/candidate
0.976823, before/candidate 1.023650, control 1.019855. The control satisfies the
fixed 2% rule, but the release comparison fails it (about 2.4% slower than 0.1.0).
The sequence stops on this valid failure; nine planned confirmations remain
unstarted. Earlier panels stay closed and unmerged. The guard improves its
immediate baseline in this panel but does not close the published-release gap,
so the combined candidate is not accepted.

A separate counter-only review finds 728/3,608 selection-state lookups in the
authored HTML120/600 replays, all WeakMap hits, with no `length` reads. Across the
193-case installed consumer replay, 486,269 of 528,080 lookups hit the WeakMap;
41,811 fall back to private state, matching the earlier numeric-get count.
There are 101,867 `length` reads and 194,214 selection constructions, including
170,136 single-node selections. All outputs/events/lifecycle counts still match.
These are logical counts, not allocation sizes or timing gains. Trying private
state first would add a failed brand check to ordinary proxy lookups; these
counts do not justify changing the map-first path or bypassing getter semantics.

Construction-origin counters attribute 240/247 and 1,200/1,207 authored HTML
selections to wrapping node inputs. The consumer replay creates 120,205 such
selections and 51,773 through selection methods; all prior totals and 193-case
output/event/lifecycle results match. These counts do not establish lifetimes.
Caching mutable wrappers is unsafe: separate wrappers support independent
properties and index edits. An identity probe also confirms that current and
published GroveDOM preserve a separate singleton `eq(0)` snapshot across splice,
where Cheerio returns the original selection. The initial probe's universal
snapshot assertion failed for Cheerio and is preserved; no runtime behavior was
changed to imitate it.

Four fresh-process CPU captures (current/released/released/current, HTML120,
200 warmups then 2,000 checked replays at a requested 100 µs sampling interval)
attribute about 6.8–8.7% of current samples and 7.4–8.8% of released samples to
selection construction. State lookup is about 0.5% in each; Wasm frames account
for roughly 57–61%. The factory body is byte-identical to 0.1.0. This identifies
an existing shared cost, not a measured regression or gain; sample attribution
is affected by inlining and scheduling and does not replace paired controls.

### Hoisted attribute-name validator

A private follow-up to the proxy candidate moves the unchanged, non-global
attribute-name RegExp from inside `attr()` to module scope. Captured optimized
Node 22 code previously allocated a 56-byte RegExp on each validation; the
hoisted version removes that allocation from the observed hot path. Optimized
`attr` code changes from 6,600 to 6,588 bytes. This is allocation/code-shape
evidence, not an elapsed speedup claim. It is the only runtime source change;
native and Wasm artifacts are unchanged.

Native/pool suites pass 1,735/1,743 cases with 59/51 skips. Both 193-case consumer
snapshots pass on both backends, as do seeded fuzzing, focused heap/worker/browser
and Node 24 checks, types, all original comparison outputs, and authored
24-cycle memory budgets on all four backends. An initial lifecycle subprocess
loaded workspace JS with the candidate's different Wasm ABI because of the
working directory; that failure is preserved and the corrected full suite passes.

Fixed pooled HTML panels compare release, pre-hoist proxy candidate, candidate
and identical control. HTML120 retains 3/4/4 blocks: raw release/before/control
1.029578/1.001203/1.011122, filtered 1.029578/1.013126/1.032766. The filtered control
is invalid, so this is inconclusive. HTML600 retains 4/3/4: raw
0.996922/1.012146/0.993619, filtered 1.000650/1.015192/0.983969, a scoped pass.
Both summaries recompute from raw data. The remaining-case sequence then passes
pooled sitemap600 (raw release/before/control 1.023850/1.030030/1.012826, filtered
1.050576/1.030030/1.010889; 3/4/4 blocks retained) and SVG300
(1.007901/0.997494/1.009024, raw equals filtered, all 12 retained). Pooled getPose
stops before the third group's first block after two complete groups; it is
incomplete, not a pass. All three summaries recompute from raw data.

The next fixed sequence completes pooled relative-colors with 2/4/4 retained
blocks, insufficient for acceptance. Pooled template stops after three blocks
in its first group when the bounded host-load pause budget expires. Both raw
summaries were independently recomputed; neither provides an aggregate result.
Pooled sitemap-pipeline then stops two blocks short, retaining 4/4/2 blocks.
Its raw summary also recomputes, but the incomplete group prevents acceptance.
Native HTML120 subsequently stops after two measured blocks, one retained,
when load rises again following a qualified precheck. The seven untouched
native cases then complete. Ratios below are release/candidate,
before/candidate and candidate/identical-control; raw equals filtered unless
both are shown.

| Native case | Raw ratios | Filtered ratios | Retained per group | Result |
|---|---|---|---|---|
| HTML600 | 1.012099 / 1.036587 / 0.955420 | 1.012099 / 1.037163 / 0.986329 | 3/4/4 | Inconclusive control |
| Sitemap600 | 0.948493 / 0.798823 / 0.917251 | Same | 4/4/4 | Inconclusive control |
| SVG300 | 1.035961 / 1.018179 / 0.959621 | Same | 4/4/4 | Inconclusive control |
| getPose | 1.025601 / 0.991813 / 1.001989 | Same | 4/4/4 | Pass |
| Relative-colors | 1.083260 / 0.988174 / 1.023212 | Same | 4/4/4 | Inconclusive control |
| Template | 1.125042 / 0.987427 / 0.976052 | Same | 4/4/4 | Inconclusive control |
| Sitemap-pipeline | 0.958078 / 0.969583 / 1.012761 | Same | 4/4/4 | Fail |

All 16 raw panels were audited together: four passes, eleven inconclusive or
incomplete, and one valid failure. The sitemap-pipeline case fails both the
release and immediate-baseline tolerance with a valid control. The candidate
is not accepted; no runtime change is promoted and no earlier passes transfer.

Three instrumented sitemap-pipeline replays preserve exact outputs and lifecycle
results. Each calls `each()` once and `text()` 600 times, but never `attr()`.
The validator allocation reduction is therefore not exercised by this failing
workload. This does not invalidate the timing failure or identify its cause;
text extraction and surrounding replay work remain the next attribution targets.

Four fresh native CPU captures subsequently run candidate/release/release/candidate,
each with 100 warmups, 1,000 checked sitemap-pipeline replays and a requested
100 microsecond sampling interval. All output and lifecycle hashes match.
Inclusive text-method samples occupy 3.82–4.15% for the candidate and 4.28–4.34%
for release; selection creation occupies 3.76–3.78% and 3.62–3.71%, respectively.
Document loading occupies 11.78–12.13% and 11.30–11.42%. Consumer URL parsing and
construction account for substantial additional work. Inclusive categories
overlap, and native frames and V8 inlining limit attribution; separate profile
durations are not paired speedups.

Source extraction confirms that `text()`, the shared `read()` function and the
selection factory are byte-for-byte identical to release. This profile does
not isolate a causal regression or justify rewriting those functions. The
valid timing failure remains evidence against accepting the candidate.

The last sitemap-pipeline host precheck reports `0.30000000000000004` against
the inclusive 30% activity limit. Computing activity as `1 - idle/total` can
round an exact boundary above that limit. The host checker now divides busy
ticks by total ticks directly, retaining the same threshold and default.
Deterministic checks cover the exact boundary and neighboring ticks at 0%,
15%, 30% and 100%; the 12-case harness suite passes on Node 22/24. Earlier
panels remain closed and keep their original classifications. This corrects
future host admission, not the independent probe or performance tolerances.

Four separate pooled-Wasm heap captures compare the pre-hoist and hoisted
versions at 120/600 articles, with 20 warmups, 40 checked replays and 4 KiB
sampling including collected objects. All outputs match. Estimated total JS
allocation falls from 7.72 to 6.94 MB and from 40.56 to 34.79 MB; allocation
attributed directly to `attr()` falls from 1.20 to 0.16 MB and from 6.36 to
0.99 MB. These statistical captures support the observed removal of RegExp
allocation; they do not measure exact counts, retained memory, Wasm allocation
or elapsed performance.

### Batch-length control diagnostic

A separate pooled HTML120 batch-size diagnostic uses four identical copies in
fixed 16/64/64/16-replay panels, each with three groups of four mirrored blocks,
100 warmups and two batches per sample. Host activity is recorded without
gating this diagnostic. Every panel has sufficient retained blocks. Designated
raw/filtered controls are 1.01318/1.01318, 0.95240/0.94996,
0.97279/0.97279 and 1.04097/1.09494; respectively two, four, four and five of the
six identical-code pairings fall outside the 2% range. Increasing batch length
does not reliably stabilize controls here. The temporary diagnostic cap is 64;
public and acceptance harness settings remain unchanged, and no result counts
as candidate acceptance.

### XML fault attribution

A separate native sitemap diagnostic finds page-fault variation strongly
associated with batch duration (correlation 0.78). GC overlaps all 192 batches
and occupies about 1.9% of observed batch time. Fault-only phase captures place
most native faults in parsing, append/flush work and serialization. A C diagnostic
extended to include XML serialization confirms variable kernel faults while
binding-output medians stay around 8–11 per batch. These process-wide counters
and instrumentation can perturb execution; they do not establish a speedup.

Child-only suppression of allocator trimming reduces median XML faults from
22–2,956 to roughly 15–18 per batch across six fresh processes. Adding mmap
threshold control does not materially improve this. But a separate fixed
default/trim/trim/default identical-code timing experiment does not reliably
stabilize controls. The first default and trim panels lack enough probe-retained
blocks per group. The second trim panel retains all 12 blocks and its designated
control is 0.98130, but three other identical-code pairs exceed 2%. The final
default control is 1.10556. All outcomes remain diagnostic; no faults or GC time
are subtracted, and no allocator default or acceptance policy changes.

## Consumer decisions

Three passes through the five-case offline consumer panel produced the same
outputs and 45 balanced document lifetimes. All 3,756 ordinary queries used one
root. This explains why multi-root and deep-traversal costs were inconspicuous.

| Area | Evidence | Decision |
|---|---|---|
| CSS plan capacity | 32 and 64 entries both give 81 hits / 3,198 misses; simulated key comparisons rise from 47,532 to 87,564 | Keep 32. Even unlimited per-document storage avoids only 78 more misses |
| Short input transfer | Both private ASCII prototypes reduce Wasm input crossings from 67,152 to 33,822 | Pending timing; crossings are not allocator calls |
| Unicode input | Direct-write prototype needs three calls; ASCII-precheck prototype keeps two | Precheck avoids the extra call, but introduces a scan |
| Repeated predicates | Two answers for the last node remove 30.6% of scalar predicate calls | Keep private until hit and miss workloads pass timing controls |
| JS validators | Hoisting two constant regex validators lowers estimated facade allocation from 5.7 to 3.9 MB in separate fixed heap captures | Promising allocation evidence; elapsed benefit unproven |
| Unicode selectors | Authored Latin, Greek, supplementary, token and substring cases match Cheerio; repeated comparisons allocate no new backing storage after warmup | Remaining long substring cost is computation, not per-comparison allocation |

The V8 captures use a 32 KiB sampling interval, include collected objects and
three measured consumer passes after two warmups. They include consumer and
verification work, exclude native arenas/Wasm memory, and are statistical
allocation estimates. URI processing dominates overall sampled allocation.
Do not turn either allocation difference or independent profiler times into a
DOM speedup. The real consumer panel still records zero Unicode-selector fallbacks.

Each of the four prototypes passed the full pooled-Wasm suite, 200 seeded cases
in both execution modes, and all 193 expanded pipeline cases against each of two
preserved consumer snapshots. These repeat the same corpus/seeds across variants;
they are not additional independent inputs. The predicate prototype also passed
the full native suite. Transfer checks cover shared/fresh heaps, growth, stale
views, Unicode boundaries and portable decoding.

The fixed precheck-transfer timing panel stopped before its first measured block.
The separately planned validator panel stopped after one quiet, probe-retained
block: baseline/candidate 0.9224, control 1.0801. Neither completed a group or met
the required sample/control criteria. Remaining panels were not started; no
replacement runs or control normalization were used. All four runtime prototypes
remain private, including the allocation improvement.

## Costs outside the current consumer panel

[`bench/structure-profile.mjs`](../../bench/structure-profile.mjs) compares values
with Cheerio and reports boundary counts at three sizes per shape. Optional
native profiling adds C operation counts. Setup, comparison and disposal are
outside the counted operation. The expanded diagnostic covers 24 cases.

| Shape | Observed work | Focused improvement to investigate when relevant |
|---|---|---|
| First/last child, 256 children | Two traversals return 512 IDs and materialize all child handles | Direct scalar child axes |
| Containment, 256 nested elements | 257 parent traversals | One kernel ancestry check |
| `nextUntil`, 128 sibling roots | 8,128 predicate calls and returned intermediate IDs | Avoid repeated sibling scans while preserving callbacks and stop semantics |
| One 4 KiB attribute value via `attr()` | Span writer reduces 4,113 C output chunks to 9 | Validate elapsed impact in an idle window |
| Enumerating 128 raw attributes | One JSON object plus 256 individual attribute reads | Prefer the existing `attr()` snapshot when a live proxy is unnecessary |
| Overlapping query roots | One visible binding call hides nested root/ancestor checks | Measure root count and depth, not only boundary calls |

Source inspection also identifies repeated ancestor/sibling walks in ordering,
linear attribute-history lookup during cloning, and repeated searches in `has`
and `closest`. These are workload-dependent candidates, not measured MDN gains.
The `until` helpers also use linear `result.includes` deduplication inside their
overlapping walks: visiting all following siblings from every sibling root can
make JS membership work cubic. A set could reduce membership cost, but skipping
walks or stop predicates requires preserving callback order and mutation effects.
Large input/output buffers grow geometrically and live until document disposal;
retained handles intentionally prevent reclamation of their detached subtrees.
Avoid changing those lifetimes, callback boundaries or snapshot copies merely to
reduce allocations. Existing pool and fragment-reuse findings remain in the
[benchmark guide](../benchmarks.md).

The JSON span writer preserves the existing escaping and writes ordinary UTF-8
runs together. For a fresh snapshot with one 4 KiB ASCII value, native counters
show output writes 4,113 → 9 and buffer allocation requests 7 → 2, with identical
4,113 output bytes. Requested allocation bytes fall from 16,256 to 8,320; these
are cumulative requests, not retained memory. At 16/256 value bytes, writes fall
from 33/273 to 9/9. Escapes still use bounded stack buffers. Authored HTML120/600
output, allocation, command and query-work counts are unchanged, so this change
does not explain the earlier HTML timing regression. Elapsed acceptance remains
pending; operation-count reductions are not speedup ratios.

Escape-boundary tests cover buffered/direct HTML and XML, all control bytes,
long UTF-8 spans and snapshot independence. Both 1,780-case backend suites pass
(Wasm 1,729 passes/51 skips; native 1,721/59), including native ASan/UBSan with
leak detection. Fault injection checks retry after each of three JSON output
growth failures in both modes. Serializer static analysis reports no findings;
200 seeded cases per backend and the portable browser sandbox also pass. Both
193-case offline consumer snapshots preserve every recorded output/event hash
and load/disposal count on native and Wasm.

## Transfer experiments awaiting idle-host timing

Three attribute snapshot layouts were checked against identical outputs. Both
binary prototypes reuse consumed Wasm transfer storage, with no version fields,
checksums or compatibility negotiation. The current 16 KiB scratch and 32 KiB
stack suffice; changing either is not justified by these counts.

| Layout | Host UTF-8 decode calls, 16 short attributes | Fresh C buffer allocation requests |
|---|---:|---:|
| JSON span writer | 1, followed by `JSON.parse` | 3 |
| DOM pointer/length records | 32 | 0 |
| Concatenated UTF-8 with UTF-16 offsets and JS slices | 1 | 0 |

Pointer records use 16 bytes per attribute and fit 1,024 attributes in scratch,
regardless of value length. They copy no string bytes into the result buffer;
larger descriptor tables use the document's reusable transfer allocation. The
joined layout copies strings and counts UTF-16 units, including supplementary
characters. Its large-output fallback grows transfer storage. Both preserve
ordinary objects, special property names, Unicode and independent snapshots.

The joined layout has a measured retention cost: keeping four 128-character
values from snapshots containing separate 2 MiB values retained about 8 MiB of
JS heap after disposal and GC. JSON and pointer records retained only tens of
KiB in the same isolated-process diagnostic. Dropping the small slices released
the joined strings. A size-bounded approach would need separate evaluation.

Neither 193-case consumer snapshot calls the all-attributes read. Each instead
uses 129,138 named-attribute reads and 38,139 text reads. Named attributes already
borrow DOM strings. A separate single-leaf text prototype avoids 37,923 output
copies totaling 3,002,595 bytes per snapshot, on native and Wasm. CDATA wrappers,
multiple nodes/children and innerText exclusions retain the general path.

The combined candidate passes 1,794 cases (Wasm 1,743/51 skipped; native sanitizer
1,735/59), both consumer snapshots and focused heap/browser checks. Allocation
faults confirm descriptor overflow recovery and allocation-free large-value
reads. These are candidate results, not elapsed-performance acceptance. The
initial host precheck was busy, and neither runtime change was promoted.

A later fixed HTML120 panel completed 9/12 retained blocks, in groups of 4/4/1,
before the host cutoff stopped it. Release/candidate ratios were
0.9761/0.9789/0.9253; identical-candidate controls were 1.0075/1.0001/1.0162.
The third group is incomplete, so there is no aggregate acceptance. The first
two groups also leave the candidate outside the 2% release tolerance.

Counters explain one limitation: the leaf-only shortcut misses every text read
in the authored `pre > code > text` workload. A separate prototype instead
borrows the first nonempty span during normal traversal, materializing the output
only when another span requires concatenation. This removes 120/600 output writes
and 2,050/10,690 copied bytes in HTML120/600, with unchanged allocation counts.
Each consumer snapshot avoids 38,139 writes and 3,084,031 copied bytes. This
candidate keeps JSON attribute transport unchanged to isolate the text change.
It passes the same 1,794-case matrix, both consumer snapshots and three injected
concatenation-growth failures per HTML/XML mode. Its initial timing attempt
stopped before any samples. Subsequent fixed panels are recorded below; it
remains private.

### Resumed transfer and validator screens

Two separately completed first-span screens used three groups of four blocks,
100 warmups and two batches of eight HTML120, four HTML600 or one saved-getPose
replay. Every block was quiet and probe-retained. The earlier screen was
inconclusive for HTML120/600: release/candidate 0.9744/1.0099, controls
0.9779/1.0275. Its getPose screen passed at 1.0275, before/candidate 0.9889 and
control 0.9865. The later screen produced:

| First-span candidate | Release / candidate | Before / candidate | Candidate control | Result |
|---|---:|---:|---:|---|
| HTML120 | 0.9981 | 1.0027 | 1.0014 | Pass |
| HTML600 | 0.9707 | 1.0082 | 1.0142 | Failed release gate |
| Saved getPose pipeline | 1.0152 | 0.9988 | 1.0105 | Pass |

Raw and filtered aggregates agree. Later median/max batches were 11.03/20.13,
25.92/39.08 and 25.65/31.02 ms. These outcomes neither establish a repeatable
text-copy speedup nor supersede the earlier failed HTML screens.

A separate private candidate combined exact short-ASCII input reservations with
factory-owned, non-stateful attribute/tag validators, using the same first-span
kernel. The input path avoids its second Wasm call for short ASCII, while Unicode
keeps the existing encoder and two-call path. The prior boundary-count and heap
evidence motivated this experiment; no C changes or heap defaults were added.

| Combined JS candidate | Release / candidate | First-span before / candidate | Candidate control | Result |
|---|---:|---:|---:|---|
| HTML120 | 1.0084 | 0.9924 | 0.9942 | Pass |
| HTML600 | 1.0141 | 1.0129 | 0.9925 | Pass |
| XML sitemap600 | 1.0054 | 0.9777 | 1.0024 | Failed before/after gate |
| XML SVG300 | 0.9760 | 0.9825 | 1.0273 | Inconclusive control |

Each completed panel retained all 12 quiet blocks; raw and filtered aggregates
agree. XML used four replays per batch with the same group/warmup settings.
A first getPose attempt stopped before samples; the subsequent original-scope
sequence stopped at getPose after three blocks, leaving no complete group.
Unstarted native/consumer panels remain unqualified. No stopped groups were
stitched together, controls normalized or sample counts extended.

The candidate preserves all eight originally comparable outputs on both
backends, plus the current Cheerio-correct SVG output excluded from the release
comparison. Native and pooled-Wasm correctness, Node 24 pooled Wasm, both
193-case consumer snapshots on Wasm, 200 seeded cases per backend, portable
browser/fallback and focused shared/fresh-heap/worker checks pass. Initial private
test-snapshot failures were missing tooling/adapter files; their logs are retained
and the affected checks pass after restoring those files. These checks do not
override the failed timing gate. Neither runtime candidate was promoted, and
the original eight-case, two-backend performance goal remains unresolved.

A further isolated Wasm prototype returns the existing input-buffer descriptor
from the reservation call. JS encodes into its data pointer, writes the NUL
terminator and stores the used byte length directly. Its private layout has no
version negotiation; it requires matching JS and Wasm. Native preprocessing is
identical to the first-span candidate, including the native input return value.
This removes the second input call for both ASCII and Unicode without a pre-scan.
Measured authored input crossings fall 18→9 for either HTML size, 14→7 for XML
sitemap600 and 16→8 for SVG300. The small HTML counts limit its relevance to that
regression; they are not elapsed gains.

The descriptor passes all 1,794 pooled-Wasm cases (1,743 pass, 51 skip), both
193-case consumer snapshots, seeded fuzzing, portable browser fallback and
focused heap/worker/Node 24 checks. Its fixed getPose panel retained all 12 quiet
blocks: release/candidate 0.9986, before/candidate 0.9985, control 1.0128;
raw/filtered aggregates agree, median/max batches 26.43/46.09 ms. This passes
the scoped tolerance but shows no incremental speedup. HTML120 then stopped
after one complete four-block group. The three initially unstarted panels were
subsequently completed with unchanged settings and 12 quiet, retained blocks each:

| Descriptor / pooled Wasm | Release / candidate | Before / candidate | Control | Result |
|---|---:|---:|---:|---|
| HTML600 | 1.0067 | 1.0306 | 0.9940 | Pass |
| XML sitemap600 | 0.9870 | 1.0090 | 0.9952 | Pass |
| XML SVG300, four replays | 0.9767 | 0.9768 | 0.9860 | Failed screen |

SVG batches were only 2.75 ms median / 5.61 ms maximum. A separately declared
confirmation used 32 complete SVG replays per batch: 1.0081 release/candidate,
1.0126 before/candidate, control 0.9845; all 12 blocks quiet and retained,
21.59/29.86 ms median/max batches. It passes this longer-batch protocol without
discarding the earlier failure. The same confirmation's HTML120 panel used 16
replays per batch but stopped after two complete groups; it remains incomplete.
Disassembly shows a smaller inlined observation path, not a new hot call; it
does not establish the cause of the short SVG failure.

The native first-span candidate was also checked against the JSON-span candidate
and release. Each panel had three groups of four blocks, 100 warmups, two batches
and at most three predeclared pauses before unmeasured blocks. HTML120/600 used
16/4 replays, XML 32, and full consumer cases one. Results below are raw/filtered
where they differ:

| Native case | Release / candidate | Before / candidate | Control | Result |
|---|---:|---:|---:|---|
| HTML120 | 0.9700 | 0.9611 | 1.0401 | Inconclusive |
| HTML600 | 0.9914 | 0.9968 | 1.0408 | Inconclusive |
| XML sitemap600 | 0.9948 | 1.3481 | 0.7669 | Inconclusive |
| XML SVG300 | 0.9970 / 0.9958 | 0.9831 | 1.0139 | Pass |
| getPose pipeline | 1.0347 | 0.9934 | 1.0001 | Pass |
| Relative-colors pipeline | 1.1012 | 0.9994 / 0.9955 | 0.9969 | Pass |
| Template pipeline | 1.0859 | 1.0098 | 1.0460 | Inconclusive |
| Sitemap pipeline | 0.9908 | 0.9994 | 1.0029 | Pass |

All 96 native block prechecks were quiet; SVG and relative-colors each excluded
one block by the independent probe, leaving 94 retained. Median batches ranged
from 5.28 to 212.78 ms; the maximum was 348.70 ms for one complete relative-colors
pipeline replay. Auditing the four inconclusive controls confirmed identical
entries, addon bytes, options and per-variant environments, without sanitizer or
profile flags. Their drift remains unexplained and is not normalized away.
Pooled-Wasm relative-colors stopped before samples after exhausting its pause
budget; template and sitemap pipeline panels remain unstarted. The descriptor
preserves both 193-case consumer snapshots on both backends and all original
comparable outputs, but the full performance goal remains open. No candidate
was promoted.

Other transport candidates remain scoped: raw attribute enumeration decodes
unused snapshot values and then performs per-key descriptor/value reads; scalar
parent/sibling results allocate tiny ID arrays. General query results still need
independent JS snapshots. Removing those copies without preserving lifetime and
mutation behavior is not an optimization. HTML serialization requires escaping
and tree traversal; an attribute descriptor format does not remove that work.

An exact-name ID lookup experiment was rejected. Lexbor's static and qualified
name representations can assign different IDs to the same spelling; replacing
string equality with ID equality missed newly set `title` attributes, failed 74
tests and changed the SVG consumer result. Correctness would require a string
fallback. The existing scan averages only 1.43 inspected attributes per authored
lookup and 1.17 over the installed consumer snapshot (175,477 lookups), so an
additional hash lookup on every access is not justified by those scan counts.
The correct string path remains in use. These are work counts, not timings.

## Compiler analysis

Clang's path-sensitive analyzer completed 12 native and 14 Wasm translation-unit
configurations using existing headers/toolchains, including the Wasm observation
path and diagnostic helpers. Two unique possible-null warnings occurred in both
targets: `has_relative` assumes a nonempty parsed selector list, and XML
serialization assumes reciprocal child/parent links.

The selector parser rejects malformed empty inputs before evaluation; forgiving
nested lists can discard empty branches. Sixteen targeted
selector forms in HTML/XML on native/Wasm produced no crash. The XML warning's
path assumes a child whose parent is null while still below the traversal root,
contrary to the tree invariant checked by lifecycle tests and stateful fuzzing.
No reachable defect was reproduced. This is a reviewed invariant dependency,
not a blanket analyzer-clean or memory-safety claim. No dependency patch or
runtime guard was added solely to suppress a warning.

## Regular-expression follow-up

An AST inventory covered 59 regex literals: 22 in shipped ESM and 37 in developer
tooling. No runtime `RegExp` constructor uses input as a pattern. The shipped
patterns have bounded alternatives, anchored runs, delimiter-separated runs or
fixed-width replacements; no individual superlinear matcher was identified.
In particular, JSON-shape detection is anchored with disjoint opening characters,
and positional numeric arguments cannot consume another pseudo's colon.

Two quadratic paths were reproduced and hardened:

- The release pagination pattern `<([^>]+)>; rel="next"` retried overlapping
  suffixes after repeated opening delimiters. Excluding both `<` and `>` from
  the URL removes that ambiguity. Tests mock every request; no live API is used.
- Positional selector matching repeatedly applied a linear regex to shrinking
  prefixes, causing quadratic aggregate work and recursive stack overflow.
  Suffixes are now consumed backwards and applied iteratively in original order.
  At 64/128/256/512 suffixes, total regex input characters fell from
  12,544/49,664/197,632/788,480 to 763/1,531/3,067/6,139. A 10,000-suffix regression
  completes without stack overflow. Counts are not elapsed speedups; applying
  filters still costs work proportional to the selections being filtered.

Both new regression tests fail against the preceding implementation. Native and
pooled-Wasm full suites, seeded fuzzing, portable browser fallback and both
193-case consumer replays pass after hardening. The fixed ordinary-positional
timing screen stopped on host activity after six quiet, retained blocks; its
third group and consumer panel did not complete. The two completed groups had
candidate/control ratios 0.9489/1.0251 and 0.9885/0.9415; both controls miss the
declared tolerance. No general non-regression multiplier is claimed.

This review does not bound every selector or DOM algorithm. The separate
negative-positional compatibility limit is recorded in the
[compatibility guide](../compatibility.md).

## Query-context regression investigation

Published 0.1.0 tarballs were verified against their release hashes. The initial
eight comparable workloads matched outputs, but all 48 host prechecks were busy
and identical-code block ratios ranged from 0.66 to 1.56. A saved SVG pipeline
whose 0.1.0 output differs from the current Cheerio-compatible output was excluded.

Source counters and native/Wasm profiles identified a concrete regression:
multi-context `find` scanned the full root list for each ancestor. The candidate
uses existing node marks for membership and ordering, reserving separate root
and result generations before marking. No allocation or node storage is added.

| Authored HTML replay | Previous membership checks | Candidate |
|---|---:|---:|
| 120 articles | 64,740 | 480 |
| 600 articles | 1,619,700 | 2,400 |

Ordinary scoped matching also uses marks: 16/64/256 disjoint contexts require
32/128/512 scope checks instead of 424/6,304/98,944. Across template fragments,
borrowed context IDs remain necessary because a covered context may itself
become a result. Differential tests also repaired an existing template-context
coverage/order gap. Wide roots, duplicates, reparenting, retained snapshots,
generation wrap and partial allocation-failure recovery are covered.

The first root-only candidate passed two numerical screens, with four other
panels inconclusive; those timings do not qualify the combined candidate below.
Each fixed panel used three groups of four rotated/mirrored blocks, four isolated
processes and two batches/sample. HTML used 100 warmups and eight/four replays per
batch at 120/600 articles; consumer panels used 20 warmups and one replay. There
was one host check per block, no retries or extensions. Acceptance required three
retained blocks per group, raw and filtered ratios at least 0.98, and controls
within 0.98–1.02, without normalization.

| Combined candidate | 0.1.0 / candidate | Before fix / candidate | 0.1.0 control | Outcome |
|---|---:|---:|---:|---|
| Wasm HTML120 | 1.0604 | 1.0698 | 1.1426 | Inconclusive |
| Wasm HTML600 | 0.9224 | 1.1145 | 1.0281 | Inconclusive |
| Native HTML120 | 1.1329 | 0.9951 | 1.1169 | Inconclusive |
| Native HTML600 | 0.9659 | 1.0506 | 0.9454 | Inconclusive |
| Native sitemap pipeline | 1.1654 | 1.0883 | 1.1644 | Inconclusive |
| Wasm saved-MDN pipeline | 0.9196 | 0.9256 | 0.9850 | Failed screen |

Raw and filtered aggregates agree; all 72 blocks were retained, 21 quiet.
Panel median batch durations were 6.1–30.4 ms, maximum 57.1 ms. The failed
consumer screen remains unresolved, not dismissed as noise. Its query contexts
were all single-root; source counters recorded no root/scope membership work.

A separate common-path experiment restored the original empty-context return.
Its fixed consumer panel had raw release/experiment 0.9327, combined/experiment
0.9378 and experiment/identical-control 1.0348. Only nine blocks survived, with
two in the final group: no valid filtered aggregate. Eight prechecks were quiet;
median/max batches were 31.3/107.9 ms. The experiment was discarded.

Short Node inspector captures (20 warmups, 40 replays, 100 µs sampling) show
similar attribution for root-only/combined code: URI.js 40.5%/39.4%, Wasm
16.5%/17.3%, GroveDOM JS 6.5%/6.4%, GC 1.5%/1.4%. Remaining samples are consumer,
runtime and other work. Outputs match. Independent profile durations are not
speedups and do not isolate the cause of the failed screen.

The current candidate passes the 1,771-case native/Wasm suites, native
ASan/UBSan/leak checks, fault tests, 200 valid differential fuzz cases per backend
in both execution modes, both 193-case consumer snapshots, portable browser
fallback, focused heap/Node 24 checks and types. Query static analysis has no
warnings; the existing selector-list warning above also occurs before this fix.
Performance acceptance against 0.1.0 remains open; no release or push was made.

### Warmup and probe follow-up

V8 traces found nine Wasm functions still optimizing during consumer samples
after 20 warmups, plus JS optimization/deoptimization. The probe's long loop
repeatedly deoptimized at its cold timer-access exit. Separating arithmetic from
the timer fixes that probe behavior. Warmups now enter through the same IPC
handler and event-loop boundary as samples, avoiding a first-sample change in
async-hook resource shapes. A regression test fails against the former child;
all five harness tests pass with the fix.

With 100 warmups, real IPC-driven traces recorded zero sampled JS optimizations
or deoptimizations in both release/current processes. One/two cold Wasm functions
still tiered up; this is not proof of complete JIT stability. Outputs and probe
checksums match. No library code changed for this follow-up.

A separately declared six-panel screen used the corrected harness, 100 warmups
for every workload, the same short batch sizes, and an identical-current-code
control. The earlier failed screen remains preserved; these protocols are not
merged or normalized. Every new panel was **inconclusive**:

| Panel | Release/current raw / filtered | Current control raw / filtered | Retained |
|---|---:|---:|---:|
| Wasm HTML120 | 0.9719 / 0.9719 | 0.9399 / 0.9399 | 11/12 |
| Wasm HTML600 | 0.9676 / — | 0.9743 / — | 4/12 |
| Native HTML120 | 1.0576 / 1.0576 | 0.9117 / 0.9117 | 12/12 |
| Native HTML600 | 1.0199 / — | 1.0364 / — | 8/12 |
| Native sitemap | 0.9397 / 1.0051 | 1.0644 / 0.9681 | 11/12 |
| Wasm saved MDN | 0.9698 / 0.9698 | 1.0705 / 1.0705 | 12/12 |

A dash means a group lacked the required three retained blocks. Only 10 of 72
prechecks were quiet; median batches ranged from 7.3 to 52.8 ms, maximum 125.7 ms.
The source work reduction is established, but a valid 2% performance acceptance
screen still requires measurements with stable controls. No extra panels were
added to obtain a pass.

A subsequent bounded idle-qualified consumer attempt stopped before initialization:
all 31 independent host checks were busy, exhausting its 30-wait budget. No
timing samples were collected. Acceptance remains blocked on obtaining stable
measurement conditions, not waived. An additional deterministic context matrix
matched Cheerio on 3,822 queries per backend across HTML, XML and templates.

After a later independent quiet precheck, a new fixed consumer panel completed
one group: four quiet, retained blocks; release/current 1.0534,
before/current 1.0060, current/identical-current 0.9797. The control narrowly
missed tolerance, and host activity stopped the next group before initialization.
The panel is incomplete; no aggregate acceptance result or replacement group was
added. A short quiet interval alone does not guarantee valid controls.

### Quiet HTML follow-up

A fixed sequence of HTML120/600 panels used 100 warmups, three groups of four
blocks, two batches and eight/four replays per batch, stopping at the first busy
precheck. Wasm HTML120 completed with all 12 blocks quiet and retained:
release/current **0.9678**, pre-fix/current **1.0545**, current/identical-current
**1.0173**. Raw and filtered medians agree. The declared aggregate control passes,
but the release comparison fails the 2% gate (about 3.3% slower). Group release
ratios were 1.0071, 0.9678 and 0.9530; controls 1.0173, 1.0453 and 0.9917.

Wasm HTML600 stopped before its third group. Its eight completed blocks were
quiet and retained, with group release ratios 0.9747/0.9828 and controls
0.9810/0.9772. It has no aggregate result. The planned native panels did not run.
These outcomes are separate from earlier protocols and are not control-normalized.

Bounded HTML120 inspector captures used 100 warmups and at most 1,500 replays
or 2.5 seconds. Selection creation was the largest individual JS self-time share
(6.8% release, 7.4% current); GC shares were 4.9%/4.4%. Boundary call counts,
output sizes and hashes agree. These independent profiles identify work to
inspect; their elapsed times and small share differences do not prove a cause
or speedup. The remaining release regression requires investigation, not merely
a quieter host.

A private closing-tag serializer experiment consolidated three output capacity
checks into one. Its full pooled-Wasm suite passed (1,721 passes, 51 skips), but
the fixed HTML120 panel showed no meaningful improvement: release/experiment
0.9761, current/experiment 0.9980, experiment/control 0.9837. All 12 blocks were
quiet and retained; raw/filtered results agree, median/max batches 11.36/18.36 ms.
It missed the release gate and was discarded without changing runtime sources.

A diagnostic component comparison paired release/current JS with both kernels;
all four combinations produced identical HTML120/600 output. These combinations
are not supported packages. Its HTML120 panel used 100 warmups, three groups of
five blocks and two batches of eight replays. All 15 prechecks were quiet;
14 blocks survived the independent probe filter, with at least four per group.
Current/control was 1.0161. Release/current was 1.0245 in this separate panel,
which does not supersede the earlier failed screen. With current JS, old/new
kernel was 0.9553; with release JS it was 0.9920. Old/new JS was 1.0622 with the
old kernel and 1.0029 raw / 1.0295 filtered with the new kernel. Group variation
and interaction prevent attributing the residual gap to one component.

Preserved native instrumentation reports identical allocation requests and
requested bytes for release/current HTML: 1,584 requests / 11,393,568 bytes for
six HTML120 replays, and 2,364 / 30,230,160 for six HTML600 replays. Commands,
output chunks and output bytes also agree. These counters do not measure every
node allocation or prove equal elapsed allocation cost, but do not justify a
heap-default change or allocator rewrite.

The generated Wasm `memcpy`, `memmove` and `memset` instruction sequences also
match 0.1.0 exactly after removing disassembly addresses (193 instructions).
Their sampled time is not evidence of changed implementations.

A private attribute-selector preparation prototype skips case-value setup for
presence selectors and replaces repeated string searches with constant name
lengths. It passes the full pooled-Wasm suite and 784 additional Cheerio
comparisons covering HTML/SVG/XML, presence, values and explicit case modifiers.
Its fixed HTML120 panel stopped on a busy precheck after three quiet, retained
blocks in the first group. Partial raw ratios were release/prototype 1.0155,
current/prototype 1.0291 and prototype/control 0.9827; there is no complete group
or aggregate acceptance result. The planned HTML600 panel did not run. The
prototype remains private and unqualified; current runtime sources are unchanged.

Matched native source-timer builds put the original case-value setup at only
0.105%/0.023% of tracked exclusive work for HTML120/600 (six replays after 20
warmups). Both make 12 calls and produce matching output. The prototype removes
most of that small phase, but this does not establish a Wasm gain or explain a
several-percent end-to-end regression; further tuning of this phase is deferred.

A separate GC observer diagnostic used the real IPC warmup path, 100 warmups,
three rotated/mirrored blocks, and two batches of eight HTML120 replays. Its
initial affinity check was quiet. Each of release/current/identical-current had
12 recorded batches: release had no in-batch GC, while each current process had
one collection occupying about 1.0% of total batch time. Their independent batch
medians were 11.15/12.10/12.94 ms. Observer overhead, differing process histories
and the identical-code spread prevent a performance conclusion. GC contributes
to variance but does not explain away the earlier failed screen; no GC time or
unfavorable batches are subtracted from acceptance results.

A final private traversal experiment moved the foreign-element eligibility
check before an out-of-line attribute-normalization call. Disassembly confirmed
that ordinary HTML then avoided that call, and the full pooled-Wasm suite passed.
Its fixed HTML120 panel completed one group (four quiet, retained blocks):
release/candidate 0.9492, current/candidate 0.9702, control 0.9957. A busy precheck
stopped the next group after one block; HTML600 did not run. There is no full
panel result, and the candidate was discarded rather than promoted from a
static work reduction. Sources and unfavorable measurements remain preserved.

The investigation is blocked pending repeatable, complete measurement windows.
Interrupted panels and identical-code spread persisted across three subsequent
continuations, despite useful source, timer and GC analysis. Current correctness
evidence stands; the original eight cases on both backends and the earlier failed
screens remain unresolved. No private micro-optimization above was promoted.

On resumption, an optional bounded-pause harness mode was added to use brief idle
windows without restarting measurements. A whole-panel budget controls waits
before unmeasured blocks; busy blocks never execute. Nine deterministic harness
tests pass on Node 22/24, including recovery, exhaustion across groups, preserving
completed samples and stopping all children. Immediate stop remains the default.

One newly declared HTML120 panel allowed three one-second pauses with fresh host
checks, keeping three groups of four blocks, 100 warmups and two batches of eight
replays. It collected 11 quiet, retained blocks before exhausting the pause budget
at the last block. Two groups are complete, the third is incomplete: no aggregate
acceptance result. Earlier panels remain closed; neither samples nor the pause
budget were extended to obtain a pass. Runtime sources remain unchanged.
An output-only recheck of the full original scope confirms all eight included
cases still match both 0.1.0 and Cheerio on both backends. Current code also
matches Cheerio on the ninth, previously excluded case; the exclusion set is
unchanged. This recheck contains no timing samples and does not close the
performance gate.
A separately declared native large-sitemap panel then exhausted its three-pause
budget before initialization, collecting no samples. Its preceding standalone
host check was quiet; that observation did not guarantee a usable later window.
