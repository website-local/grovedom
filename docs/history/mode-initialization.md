# Selecting a selection mode at initialization

This private prototype chooses raw or Proxy construction once per facade. It
works with the current direct-loop runtime, but the completed comparison gives
**no dependable speed advantage over simple dual mode**. At this checkpoint,
simple dual remained the experimental reference and no runtime/API/type/binary
change was selected. The [subsequent landing](#subsequent-simple-dual-landing)
exposes that reference without changing this panel's evidence.

The source baseline is e117811, whose runtime remains d8ded63; later browser
checker and Actions changes do not affect the runtime. Earlier subclass,
delegation and generated-hot-method experiments remain separate and closed.

## Architecture and maintenance

The initialization variant chooses between two small selection constructors.
All DOM algorithms stay shared. It has no document mode field, forwarding
adapter or per-document mode switch; nested loads inherit the facade choice.
The reference uses one class/facade and a state.fast construction branch.
Static references contain a complete raw graph or the exact current compatible
graph. Array-first merge uses get() in graphs that support raw selections.

Mixing the initialization variant requires two facades, with separate classes
and brands but one shared kernel in this diagnostic. Simple dual shares its
facade too. Static mixed tracing uses separate graphs and pools, sharing only
the compiled Wasm module. These are broader differences than branch removal.
Cross-mode interoperability is not a new promise. Cached binding timers create
no selections, so their ratios cannot measure an executing constructor branch.

## What the traces establish

Every single-mode process has **zero wrong-map events** in this diagnostic.
First-use Wasm-instance call-target/type-feedback deopts still occur when a
second simultaneous document introduces another Wasm instance. Single-mode
execution is therefore not entirely deopt-free, and these observations do not
prove all workloads have the same behavior.

Mixed simple dual has four wrong-map deopts: entry, eq, each and attr. The
initialization variant has three: Selection construction, entry and attr,
plus call-target/value deopts. Its method/prototype identities are different
across facades, but methods created from the same factory still share V8
feedback. Creating a new class/function object is not sufficient isolation.
Separately evaluated static graphs have zero mixed wrong-map events.

All nine steady phases have zero recorded events. The initialization variant
has six allocation-site tenuring invalidations during the surviving-document
work after disposal. None occurs in the dispose call itself; these events do
not demonstrate recurrence of the previously fixed disposal-field dependency
problem. Static mixed tracing has six tenuring invalidations during warmup.
Counts include compiled tiers/versions, and trace duration is not timing evidence.

## Timing interpretation

Unless labeled Proxy/raw, elapsed ratios are candidate/reference: below one
favors the candidate. Brackets show the full observed range, not a confidence
interval. The tables retain both import orders and identical-code controls.

Results are mixed and controls are wide. Initialization-time Proxy articles
take 1.082 of static-compatible elapsed time (10/12 groups slower); fresh
Proxy Canvas takes 1.110 of simple dual (3/4 blocks slower). These unfavorable
observations remain in the result. Other cases favor the candidate or cross
parity, without a consistent overall winner. No panel is extended or replaced.

Raw public callbacks have a consistent direction in this panel: Proxy/raw
medians are 1.745 for simple dual and 1.549 for initialization selection, with
all four matching process blocks above one in each architecture. Controls limit
the precision of those multipliers. Cached reads, articles and the saved Canvas
workload do not demonstrate a general raw-mode win. There is no new complete
consumer or Cheerio comparison.

## Fixed protocol and checks

Node 24.18.0, pooled Wasm, ordinary JIT and GC. Four cases: 384 anchors with
192 cached/public-callback rounds; twelve complete shared articles120 replays;
and two complete saved Canvas corpus replays per batch. Binding setup is outside
timing and retains two documents per active mode. Full replays include parsing,
queries, edits, serialization and disposal. All variants use identical get-based
corpus snapshot checks. Outputs are retained through each batch and hashed after
timing. Imports, compilation, setup, validation and result I/O are excluded.

The fixed schedule completes 32 paired single-mode processes, 128 fresh processes
and 16 mixed diagnostic processes: **1664 timed, 1024 warmup and 384 peer batches**.
Paired processes use four warmups and six mirrored groups, both import orders.
Fresh comparisons use four ABBA/BAAB process blocks, four warmups/four samples
per process, reversed mode order by block, and repeated-process controls.
Mixed timing covers bindings only, with an opposite-mode peer before each timed
batch. Nine additional processes trace deopts. No filtering, control division,
forced GC or result-driven extension is used. Ranges below are descriptive,
not confidence intervals.

Each architecture passes 570 focused contract assertions covering both modes,
plus 40 direct-method cases in each mode (1710 assertions and 240 method cases
in total).
HTML/XML, buffered/direct execution, callback order, snapshots, coercion,
disposal, merge, numeric/generic indexing and nested-load mode are covered.
All four workload hashes match. This does not add a public API/type, native,
worker, actual-browser or sustained-consumer qualification.

Every Node run uses 64 MiB V8 old space, 4 MiB semi-space and a 192 MiB sampled
process-group RSS stop, with serial execution and a timeout. Peak sampled RSS
is 74364 KiB; no guard or timeout stop occurs. RSS polling is not a hard cap.
All 262 frozen files and 22 current source files verify after the panel.

## Single-mode paired: once/static

| Case | Mode | Candidate/reference | Below one | Identical control | Candidate import-order medians | Control import-order medians |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| cached | raw | 0.906 [0.619, 1.465] | 9/12 | 1.050 [0.772, 1.499] | 0.793 / 0.950 | 1.131 / 0.976 |
| cached | proxy | 0.961 [0.800, 1.136] | 9/12 | 0.967 [0.589, 1.419] | 0.961 / 0.934 | 0.967 / 0.901 |
| callback | raw | 1.045 [0.772, 1.314] | 5/12 | 1.030 [0.754, 1.516] | 1.065 / 0.906 | 1.042 / 0.997 |
| callback | proxy | 1.013 [0.721, 1.178] | 6/12 | 0.848 [0.639, 1.453] | 1.102 / 0.932 | 0.790 / 0.872 |
| articles | raw | 0.974 [0.724, 1.752] | 7/12 | 0.825 [0.597, 1.547] | 1.008 / 0.974 | 0.823 / 0.855 |
| articles | proxy | 1.082 [0.962, 1.589] | 2/12 | 0.969 [0.566, 1.309] | 1.068 / 1.082 | 0.888 / 1.037 |
| canvas | raw | 1.009 [0.626, 1.300] | 6/12 | 1.048 [0.782, 1.402] | 0.922 / 1.015 | 0.884 / 1.092 |
| canvas | proxy | 1.002 [0.791, 1.093] | 6/12 | 1.116 [0.717, 1.415] | 0.948 / 1.022 | 1.102 / 1.116 |

## Mixed diagnostic: once/dual

| Case | Mode | Candidate/reference | Below one | Identical control | Candidate import-order medians | Control import-order medians |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| cached | raw | 1.021 [0.522, 1.428] | 5/12 | 1.021 [0.645, 1.448] | 0.813 / 1.042 | 1.138 / 0.902 |
| cached | proxy | 0.972 [0.811, 1.634] | 8/12 | 1.002 [0.665, 1.323] | 0.972 / 0.940 | 1.002 / 0.943 |
| callback | raw | 1.108 [0.932, 1.283] | 2/12 | 0.896 [0.637, 1.502] | 1.051 / 1.160 | 0.896 / 0.834 |
| callback | proxy | 1.158 [0.497, 2.151] | 5/12 | 1.033 [0.894, 1.711] | 1.006 / 1.326 | 1.108 / 1.005 |

## Fresh processes: once/dual

| Case | Mode | Once/dual | Below one | Dual process control | Once process control | Dual-first / once-first |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| cached | raw | 1.226 [0.930, 1.559] | 2/4 | 0.964 [0.410, 1.631] | 0.843 [0.567, 1.953] | 1.202 / 1.268 |
| cached | proxy | 1.103 [0.975, 1.165] | 1/4 | 0.880 [0.825, 1.129] | 0.894 [0.706, 1.436] | 1.121 / 1.051 |
| callback | raw | 1.006 [0.919, 1.115] | 2/4 | 1.017 [1.005, 1.394] | 1.108 [0.769, 1.201] | 1.031 / 0.993 |
| callback | proxy | 0.915 [0.754, 1.115] | 3/4 | 0.958 [0.666, 1.406] | 1.023 [0.887, 2.069] | 0.795 / 1.054 |
| articles | raw | 0.932 [0.671, 1.192] | 3/4 | 0.843 [0.735, 1.086] | 0.977 [0.712, 1.106] | 1.043 / 0.820 |
| articles | proxy | 0.984 [0.681, 1.454] | 2/4 | 0.814 [0.530, 1.166] | 1.003 [0.884, 1.251] | 1.187 / 0.864 |
| canvas | raw | 1.034 [0.769, 1.047] | 1/4 | 1.091 [0.932, 1.813] | 0.873 [0.799, 1.087] | 0.908 / 1.034 |
| canvas | proxy | 1.110 [0.961, 1.396] | 1/4 | 0.939 [0.780, 1.343] | 1.105 [0.730, 1.609] | 1.252 / 1.037 |

## Raw versus Proxy in fresh single-mode processes

Ratios here are Proxy/raw within matching blocks, not ratios divided across unrelated panels. Controls above apply.

| Case | Architecture | Proxy/raw | Raw-first / Proxy-first |
| --- | --- | ---: | ---: |
| cached | dual | 1.200 [0.662, 1.487] | 1.074 / 1.200 |
| cached | once | 1.004 [0.767, 1.244] | 0.971 / 1.039 |
| callback | dual | 1.745 [1.246, 2.337] | 1.975 / 1.561 |
| callback | once | 1.549 [1.284, 1.964] | 1.519 / 1.655 |
| articles | dual | 1.003 [0.803, 1.216] | 1.009 / 1.003 |
| articles | once | 1.053 [0.939, 1.305] | 1.122 / 1.053 |
| canvas | dual | 0.880 [0.825, 1.013] | 0.833 / 0.967 |
| canvas | once | 0.991 [0.855, 1.498] | 1.194 / 0.973 |

## Trace counts

| Architecture | Modes | Wrong map | Tenuring invalidations | Steady events | Disposal/post-disposal events |
| --- | --- | ---: | ---: | ---: | ---: |
| dual | raw | 0 | 0 | 0 | 0 |
| dual | proxy | 0 | 0 | 0 | 0 |
| dual | mixed | 4 | 0 | 0 | 0 |
| once | raw | 0 | 0 | 0 | 0 |
| once | proxy | 0 | 0 | 0 | 0 |
| once | mixed | 3 | 6 | 0 | 6 |
| static | raw | 0 | 0 | 0 | 0 |
| static | proxy | 0 | 0 | 0 | 0 |
| static | mixed | 0 | 6 | 0 | 0 |

## Emitted size and API choice

| Output | JS bytes | Extra over current compatible | Concatenated gzip bytes |
| --- | ---: | ---: | ---: |
| static-proxy | 121392 | 0 | 27459 |
| static-raw | 119427 | -1965 | 26994 |
| dual | 121678 | +286 | 27524 |
| once | 121642 | +250 | 27509 |
| full-split | 240819 | +119427 | 53487 |

Counts cover the unminified Wasm Node/browser JS graph, excluding native,
declarations, metadata, harnesses and the binary. Compression is sorted source
concatenation with newline separators, gzip level 9; it is not package/download
size. Compressing the two static graphs separately totals 54453 gzip bytes.
All variants share the unchanged 841374-byte Wasm artifact. Full split can be
generated from one maintained algorithm source, but emitting both graphs adds
119427 raw-source bytes over current compatible code. Deploying one graph needs
only that graph. Startup and parsed-code memory costs were not measured.

Initialization selection adds 250 JS bytes over current compatible source,
versus 286 for simple dual. That small difference supports feasibility, not a
speed claim. A typed factory or separate raw entry would make the contract
clearer than a global init flag: calling init cannot specialize the type of a
separately imported load function. Raw selections omit numeric indexing while
generic mapped collections retain it. Declarations, packaging and mode-specific
API qualification remain necessary before exposing such an entry.

The useful next performance question is whether the consumer benefits from
using raw selections end to end with identical output. Further constructor,
subclass or delegation variations are not justified by this panel. Keep the
current compatible runtime and Cheerio consumer default while that full-workload
adoption evidence remains unproven.

## Subsequent simple dual landing

Unreleased 0.1.3 now exposes `loadFast()` beside `load()` on Node, browser and
native entries. It retains the measured shared facade/class/kernel and
per-document construction branch. `load()` keeps its numeric-index Proxy;
`loadFast()` returns plain selections. No initialization-time specialization,
subclass, delegate or generated source graph was added.

Shared declaration method lists preserve the mode through chains and nested
loads. Generic mapped values keep numeric indexing, and foreign query contexts
retain their document's behavior. [Selection mode semantics](../compatibility.md#selection-modes)
and [qualification](../testing.md#unreleased-013-selection-modes) describe the public contract and checks.
The size table above remains the experimental graph's measurement, excluding
the later public entry wrappers, declarations and regression tests.

Including the public wrappers, the landed Wasm Node/browser graph adds 572 JS
bytes over the compatible baseline, or 86 bytes in the same concatenated-gzip
estimate. The Wasm binary remains unchanged; declarations and tests are excluded.

This landing adds no timing panel and does not resolve full-workload gains or
the consumer adoption target. Keep Cheerio as the consumer default.
