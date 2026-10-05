# Performance evidence and measurement

The primary target is **Node with pooled Wasm**. Architectural refactoring must
preserve its full-workload performance within measurement noise, as well as
successful outputs and lifetime behavior.

## Acceptance

The adoption requirement remains at least **3× current Cheerio** on the complete
required DOM workload, including bindings, callbacks, serialization and disposal.
Also beat the fastest behaviorally acceptable Cheerio/parse5 or htmlparser2
configuration. This is not a whole-downloader speedup, nor automatically a 3×
requirement against optimized htmlparser2.

Use the same input bytes, parser options, workload weights and output contract.
Exclude network/disk with preloaded deterministic inputs. Keep recurring instance
creation, encoding, mutations, serialization, cleanup and in-batch GC in timing.
Do not infer backend superiority from parser-only or call-boundary measurements.

## Short checks

- Review existing results before running anything new.
- Use short batches fitting brief idle windows. Fix the panel/run count before
  looking at results; do not extend long campaigns to chase a passing ratio.
- Check CPU and sibling activity before every balanced block. Keep identical-code
  controls in the same rotation and run only one implementation at a time.
- Retain all raw samples. The established independent-probe max/min filter is
  1.5; never filter on candidate time, ratio or GC behavior.
- Report raw/filtered ratios, retained blocks, quiet prechecks and controls.
  Never normalize candidate ratios by control ratios. A quiet precheck does not
  guarantee an uninterrupted block or remove JIT/order effects.
- Keep different warmup/batch protocols separate. Short diagnostics with too few
  independent groups cannot establish a precise non-regression result.
- Use release artifacts paired with their JS. Keep tests/builds/profilers out of
  timing windows; keep logs, CPU inventories and local paths outside public docs.

The operational regression screen uses raw/filtered baseline/candidate medians
at least 0.98 and controls within 0.98–1.02. This is a measurement tolerance, not
proof of exactly zero slowdown. Inconclusive controls remain inconclusive.
Read inherited CPU affinity through the scheduling API (`taskset`); some Linux
compatibility layers report a stale mask in `/proc/self/status`. Do not expand
the process's inherited affinity or change host-wide scheduling settings.

## Established scoped evidence

### Expanded MDN diagnostic

Short profiles of four MDN inputs plus an authored sitemap use the actual
consumer pipeline with mocked downloads and without replay tracing, compression
or output files. Macro-guarded native phase timers, Node inspector CPU sampling
and Node's V8 tick profiler identify URL parsing/rewriting as the largest consumer
cost. Within GroveDOM, repeated queries, binding work and selection creation
matter more than parsing in this sample. These are bottleneck observations, not
DOM adoption ratios or hardware cycle measurements.

String `.is()` now avoids a temporary filtered selection. A separately counted
five-case replay creates 8,731 selections instead of 14,193 (38% fewer), with
identical output. Query contexts for `.end()` are materialized only when used.
Two fixed three-block pooled-Wasm screens on one saved MDN page were
**inconclusive**: the combined change/released-package ratio was 1.0003 with a
1.1028 identical-code control; the facade comparison retained no blocks
under the independent probe rule (raw ratio 1.4097, control 1.1243). All prechecks
were busy. These screens were not extended, establish no speedup or precise
non-regression bound, and leave the historical adoption evidence unchanged.

### Allocation and pool follow-up

Fixed diagnostics revisited the five-case profile panel and the earlier
eight-case consumer panel. Each process ran one cold pass, two warmup passes and
three measured passes. Outputs matched an uninstrumented replay and every load
was explicitly disposed. These are instrumented bottleneck captures, without
paired timing controls, not speed comparisons. The earlier roughly 2.3× result
included consumer URI processing and cannot establish a DOM-only adoption ratio.

| Three measured passes | Five cases | Eight cases |
|---|---:|---:|
| Loads | 45 | 54 |
| Native backing allocation/reallocation requests | 11,538 | 14,319 |
| Native allocation/free hook exclusive time | 7.17 ms | 8.36 ms |
| Share of timed native DOM work | 1.48% | 1.43% |
| Default Wasm new instances / byte-limit retirements | 0 / 0 | 6 / 6 |
| Default Wasm linear-memory growth calls / time | 8 / 0.18 ms | 47 / 0.76 ms |

Native hooks include allocator bookkeeping and calloc zeroing; exclusive times
avoid counting nested malloc twice. Requests count arena backing allocations,
not individual nodes. Queries and bindings dominate the instrumented native
phases. Timed URI.js static/prototype methods take 44–49% of total pipeline time
across the four default captures; timed DOM work takes 15–20%. Unwrapped consumer
JS and asynchronous scheduling remain separate. Callback work is excluded from
DOM time, and nested DOM calls are counted again. Timer overhead affects these
shares; they are consistent with the earlier CPU profiles, not precise production
percentages or a claim that native and Wasm timings are directly comparable.

The default eight-case pool hits its byte limit, not its instance-count limit.
Its six measured creations take 3.74 ms from create entry to the post-instantiation
hook, before kernel initialization and parsing. Raising only the idle byte budget
to 32 MiB removes observed retirements and new instances, retains 19.125 MiB
instead of 15.125 MiB, and reaches zero growth in the last two passes. The default
five-case pool also reaches zero growth in its last two passes. This supports an
application-specific pool override when the extra retained memory is acceptable;
it does not establish a speedup or justify larger defaults, a larger initial heap,
or an allocator/dependency rewrite. All defaults remain unchanged.

The reusable [diagnostic collectors](../diagnostics/README.md) are excluded from
published packages; allocator scopes compile out of release C.

### Scoped selectors and tag predicates

A subsequent correctness sweep checked 20,980 generated selector/context
combinations against Cheerio. Scoped ancestry and nested `:has()` fixes remove
all 320 observed differences; additional regressions cover overlapping contexts.
Both backends still match all 174 saved-input checks and all 193 pipeline cases
on each of the two consumer snapshots. These fixes use GroveDOM's compatibility
matcher and require no additional dependency patch.

Plain-tag `.is()` calls now request a scalar result and stop at the first match.
Other selectors retain their existing collection semantics. One five-case real
consumer replay returns 1,360 ID arrays instead of 6,822, with 5,462 calls using
the scalar path. Both backends keep the same 14,401 binding calls and exact
outputs. These count array returns, including empty arrays reused by Wasm, not
5,462 newly allocated objects or an equivalent elapsed-time improvement.

Two fixed Node/pooled-Wasm screens compare the predicate/scoping change with its predecessor
and an identical-code control. Each has one group of three rotated/mirrored
blocks and two batches per sample. The authored link/tag replay uses ten warmups
and four replays per batch; the saved MDN consumer page uses five warmups and one
replay per batch. All host prechecks are busy; each screen retains two of three
blocks under the unchanged independent probe filter.

| Short screen | Candidate raw / filtered | Control raw / filtered |
|---|---:|---:|
| Authored link/tag checks | 1.236 / 1.188 | 1.114 / 1.152 |
| Saved MDN consumer page | 1.160 / 1.037 | 1.193 / 0.972 |

Ratios are baseline/candidate; neither screen passes the control tolerance.
Both remain inconclusive and were not extended. The change establishes fewer
result-array returns, not a repeatable speedup or a precise non-regression bound.
The final covered-root ordering fix has correctness validation only and was not
included in these timing screens.
Initial heap and pool defaults remain unchanged.

### Earlier acceptance panels

The pre-refactor `b27dbe2` checkpoint measured:

| Panel vs current Cheerio | Native median | Pooled Wasm median |
|---|---:|---:|
| Mixed synthetic HTML/XML | 5.804× | 5.400× |
| Complete nineteen-scenario consumer | 4.920× | 4.621× |
| Eight saved MDN pages, raw | 5.480× | 5.102× |

Those panels passed their scoped aggregate rules and faster-compatible-baseline
checks. Individual pooled SVG and native XML regression margins were narrow.
They are historical results, not measurements of browser performance or proof of
production adoption. See [full evidence and controls](history/benchmarks.md#wasm-first-investigation-after-2eef7b6).

The subsequent [five-candidate recheck](history/benchmarks.md#candidate-recheck-after-b27dbe2)
promoted none: compiler, inlining, caching and native-layout gains were mixed.
Ten original panels retained 163/165 probe-filtered blocks, only 139 also quiet.
Four missing panels were completed with short, separately reported screens.
All 23 short blocks were quiet/probe-retained, but one control still failed.

## Architecture refactor screen

Six fixed short panels compared the pre-refactor release with the public
Node/pooled-Wasm entry and a byte-identical baseline control. Each panel used
three fresh process groups, three rotated/mirrored blocks per group, twenty
warmups and two batches of one complete replay per request. Startup and IPC were
excluded. All 54 blocks passed the unchanged independent-probe filter; raw and
filtered estimates therefore agree. Estimates below are medians of group medians,
with baseline/candidate ratios above one favoring the refactor.

| Panel | Node | Refactor | Control | Quiet prechecks | Numerical screen |
|---|---:|---:|---:|---:|---|
| XML | 22 | 1.0363 | 1.0015 | 3/9 | Pass |
| XML | 24 | 0.9724 | 0.9768 | 8/9 | Inconclusive |
| Mixed synthetic | 22 | 0.9847 | 0.9762 | 5/9 | Inconclusive |
| Mixed synthetic | 24 | 0.9932 | 0.9807 | 9/9 | Pass |
| Nineteen-case consumer | 22 | 1.0353 | 1.0226 | 9/9 | Inconclusive |
| Nineteen-case consumer | 24 | 1.0383 | 1.0068 | 7/9 | Pass |

All panels retain three blocks in each of three groups. Busy prechecks remain in
the results, not silently filtered. Three controls exceed the fixed 2% tolerance;
quiet prechecks alone did not eliminate drift. These short results do **not**
establish complete non-regression acceptance, a reproducible slowdown, or a new
Cheerio speedup. The initial panels were not extended. Later confirmations below
close the scoped screen; this is not a production-performance approval.

A separate, fixed nine-block XML/Node 24 confirmation began after a quiet host
precheck. Every timed-block precheck subsequently reported busy activity. All
nine blocks passed the probe filter: raw/filtered candidate ratio 0.9509 and
control 1.0804. Group candidate medians ranged 0.8718–1.1275; controls ranged
0.8873–1.1275. This confirmation is also inconclusive and is not combined with
the earlier panel. It demonstrates that a quiet startup check did not provide a
stable measurement window. No additional blocks were added.

### Corrected affinity and final confirmation

The scheduler's effective inherited affinity differed from the mask exposed by
`/proc/self/status`. The old picker consequently considered only a subset of
eligible CPUs. The corrected picker reads `taskset`, verified against explicitly
pinned child processes, and retains the same sibling/load/probe rules. Earlier
timings remain valid observations of their chosen CPU and are not discarded.

Three fixed panels revisited the unresolved cases. All 27 blocks were quiet and
probe-retained. Synthetic and consumer Node 22 passed; XML Node 24 still had an
inconclusive control despite quiet prechecks. Its single-replay batches lasted
about 2.9 ms, so a distinct, predeclared XML confirmation used 100 warmups and
eight replays per batch, keeping three groups of three blocks. Actual batch DOM
time was 20.0 ms median, 29.7 ms maximum. All nine blocks were quiet and retained.
The protocols are reported separately, not combined or normalized by controls.

| Corrected-affinity panel | Refactor raw = filtered | Control raw = filtered | Screen |
|---|---:|---:|---|
| XML / Node 24, one replay | 0.9681 | 0.9377 | Inconclusive |
| Synthetic / Node 22, one replay | 1.0047 | 0.9937 | Pass |
| Consumer / Node 22, one replay | 1.0242 | 1.0038 | Pass |
| XML / Node 24, eight replays | 0.9844 | 1.0059 | Pass |

Together with the initial XML/Node 22, synthetic/Node 24 and consumer/Node 24
passes, these confirmations close the six-panel scoped non-regression screen.
XML/Node 24 has only 0.0044 ratio headroom above the 0.98 threshold. This supports
the refactor within the stated measurement tolerance, not exactly equal speed,
every workload or broader platform performance. Library source/artifacts are
unchanged across these confirmations. No further timing is required for this
architectural checkpoint.

## Harnesses

`bench/window.mjs --manifest=FILE --groups=1..3` implements this bounded protocol
with sibling-aware load checks. A manifest supplies named variant entry paths,
optional explicit initialization `options`, and a shared workload/corpus.
Defaults are 20 warmups and one replay per batch; bounded `--warmups=1..100` and
`--iterations=1..8` permit short multi-replay batches for very small inputs. Fix
settings before timing, report actual batch duration and keep protocols separate.

`bench/run.mjs` is an authored comparison; `bench/process.mjs` and
`bench/short.mjs` support explicit isolated variants. Their historical defaults
are not a recommendation for another long run: set bounded warmups, blocks,
batches and iterations for the input size. Developer harnesses use
`diagnostics/`; shipped entries do not.

`bench/consumer-replay.mjs` executes the deterministic real consumer transforms.
`bench/phase-profile.mjs`, `bench/consumer-profile.mjs` and CPU/allocation tools
are diagnostic, never release timing evidence. [Memory](memory.md) and
[stack](stack.md) describe separate verification.

The browser demo compares three short rounds against DOMParser and optional
CDN-loaded Cheerio 1.2.0 with its default parser. It checks exact outputs and
rotates execution order; loading is excluded. It is a local browser comparison,
not a controlled adoption gate. CDN failure leaves the DOMParser comparison usable.
