# Direct callback loops

`is(function)` now iterates selection IDs directly, preserving the user's
predicate, node identity, visit snapshots and early exit. Unnamed `removeData()`
deletes cached data by ID without constructing node handles. Named removal and
`filter` keep their existing implementations.

These paths avoid internal `each` callbacks and helper dispatch. They do not
look up a patched `each` or retain an override fallback. Internal method dispatch
is outside the [compatibility contract](../compatibility.md); actual user
callbacks retain their documented semantics. The change adds **679 source JS
bytes**, with no declaration, package-version or Wasm change.

## Scoped measurements

A preliminary three-method screen identified `is` and unnamed `removeData` as
leads. Index-only `filter` had material order/control drift; attribute-reading
`filter` had no clear gain. Neither filter change was retained.

A separate fixed confirmation compares the final two-method implementation with
the compatible runtime at `ec7b3dc`. Pooled Wasm on Node 24.18.0, JIT enabled,
uses 256 elements, two retained documents per graph and two independent graphs
per process. Both import/start orders have candidate and identical-reference
comparisons: eight processes total. Each process has eight warmups per variant
and six mirrored groups with two timed samples per variant per group.

Ratios below are **candidate/reference elapsed**, lower is faster. Brackets are
the full range of 12 paired groups nested in two processes, not confidence
intervals. No timing filtering, control normalization or forced GC is used.

| Workload | Candidate median [range] | Identical-code control median [range] | Favorable groups |
|---|---:|---:|---:|
| `is` with last-element predicate | .819 [.628, .875] | 1.016 [.953, 1.128] | 12/12 |
| Populated cache refill + `removeData()` | .844 [.741, .889] | 1.023 [.909, 1.413] | 12/12 |

Candidate medians by import order are .812/.827 for `is` and .828/.873 for cache
removal. Both methods improve in both orders; the controls still vary. The
observed median time reductions, about 18% and 16%, are narrow diagnostic results
rather than precise production estimates. They do not isolate the effect of
removing the override fallback from the preliminary prototype.

The `is` batch makes 1,024 calls with cached handles and visits all 256 elements
per call. The cache batch makes 256 calls, each preceded by the same direct
Map.set refill; refill and output checks are included in elapsed time. This is
populated cleanup plus refill, not a measurement of public data population.
All **192 timed and 128 warmup batches** return checked results. CPU counters
are too coarsely quantized for ratios at these batch sizes and are not used.

## Validation and limits

[Callback regressions](../../test/callback-loops.test.mjs) cover occurrence
snapshots, mutation during predicates, early exit, exceptions, disposal, retained
data objects and attribute-cache rehydration in HTML/XML and buffered/direct
execution. Together with existing observation, predicate, facade-state, array
and selected upstream is/data checks, pooled Wasm and native each pass **91 tests
with one existing upstream exclusion**. The final source is verified against the
measured candidate; all other runtime files are unchanged.

No raw/dual-mode implementation is added. Browser, worker, sustained-memory and
complete-consumer performance are not newly qualified by these checks. The
[full-workload adoption target](../benchmarks.md) remains open.
