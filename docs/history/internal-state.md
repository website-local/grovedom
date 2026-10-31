# Internal state and lifecycle investigation

This scoped 0.1.3 investigation covers the JavaScript facade and Wasm transport.
The Wasm binary is unchanged. It does not establish the complete current consumer
workload, the 3× Cheerio adoption target, browser speed or sustained memory.

Selections and node handles now expose unsupported direct records, following the
[internal-state policy](../design.md#internal-javascript-state). Numeric selection
indexing, snapshots and successful outputs remain supported. Duplicate helper
calls are removed where a synchronous caller already has the record, ID, length
or liveness guarantee; callbacks, coercion and iterator resumption retain checks.

The authored 120-article call-count comparison reduces `alive` calls from 2,187
to 1,463, `entry` calls from 728 to four, and private node-record accessor calls
from 240 to zero. Kernel call counts match across all nine diagnostic workloads.
Direct selection records also introduce another Proxy get trap. Before tuning
that trap, the complete patch regressed saved cached reads by a median 9.3%, with
all six groups slower. Returning `_state` directly and bypassing numeric-key
parsing for ordinary method names corrected that observed regression.

## Complete patch comparison

Node 24 paired elapsed ratios below are **candidate / original facade**; lower
is faster. Each comparison uses a separate two-variant process, six groups with
mirrored halves, twelve initial warmups, ordinary GC and checked outputs. The
saved MDN loops use 512 cached anchors; article, form and attribute-map cases
include their authored parse-to-disposal workloads. These are unweighted cases.

| Case | Candidate median [group range] | Identical original-code control |
|---|---:|---:|
| Saved cached reads | 0.900 [0.885, 0.929] | 1.014 [0.988, 1.059] |
| Saved callback reads | 0.500 [0.487, 0.529] | 0.817 [0.792, 0.891] |
| Saved read/write/observe | 0.840 [0.770, 1.097] | 0.982 [0.897, 0.999] |
| Articles120 | 0.875 [0.811, 0.992] | 1.007 [0.959, 1.088] |
| Articles600 | 0.917 [0.873, 1.005] | 1.007 [0.898, 1.088] |
| Attribute maps200 | 0.907 [0.852, 0.961] | 0.979 [0.820, 1.073] |
| Forms160 | 0.717 [0.531, 1.012] | 1.010 [0.671, 1.429] |

Controls, especially callbacks and forms, limit precise speed claims. Unfavorable
groups remain included; ratios are not normalized by controls. Earlier panels
with larger control drift are retained separately. A four-variant large-document
panel stopped at its RSS guard after completing only cached reads. Subsequent
comparisons used one case and two variants per process, a 64 MiB V8 old-space
limit, 4 MiB semi-space limit, deadline and a 192 MiB polled aggregate RSS stop
guard. RSS polling can overshoot and is not a hard process-memory cap.

## Deoptimization findings

The nullable owner replaces the redundant `closed` flag. Resource initialization
establishes mutable fields before hot reads, and disposal no longer resets queue
lengths that cannot be used afterward. A controlled three-document trace records
24 dependent-code invalidations at the first disposal before this change and
zero afterward. Another document continues running through that disposal.

Introducing a second Wasm instance still causes one-time wrong-call-target
deopts. Per-export wrappers did not remove them. A shared call dispatcher removed
the four observed library call-target deopts but added 5.6% to cached reads in
its paired diagnostic; the preceding four-variant case also regressed 6.4%.
That dispatcher was rejected. Deleting state properties also failed: it changed
the invalidation reason rather than eliminating the invalidations. No optimizer
disabling, synthetic DOM warmup or retained instance was added to hide traces.
The retained-instance traces show no recurring deopts in their steady phase.

## Shared-class compatible and fast modes

The experiment uses one facade, one `Selection` class and one kernel, returning
`state.fast ? target : new Proxy(target, selectionProxy)`. Mode selection and
`loadFast` add **175 source JS bytes** over the equivalent compatible graph;
declarations and packaging are excluded. The same Wasm file serves both modes.
A separate complete fast graph is about 108 kB of source JS, before packaging
and declarations; its Wasm need not be duplicated.

With the final Proxy change, a separate authored binding diagnostic retains two
512-anchor documents per facade, uses eight mirrored groups and checks all 224
samples. The mixed fast path costs a median **3.5%** for cached reads and **4.5%**
for callbacks versus standalone fast code; every paired group is slower, with
ranges 1.8–9.6% and 1.7–19.5%. Compatible-only dual callbacks are also 5.2% slower
than standalone compatible code. Identical compatible controls are 0.984 and
0.988 for cached and callback reads, respectively.

Raw/Proxy mixing adds wrong-map deopts in selection methods on the first switch;
they do not recur in the trace's steady phase. Sharing a class also shares JIT
feedback. The cached loop creates no selections, so the constructor's mode
branch does not execute inside that timed loop.
Earlier pre-tuning diagnostics had larger mixed-mode penalties and remain
separate evidence. No public fast-mode API or foreign-input serialization shim
is included in this change.
