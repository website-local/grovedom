# Ownership and memory

Explicit `$.dispose()` is the primary lifecycle contract. It clears pending JS
commands, releases kernel ownership and invalidates retained wrappers. Outputs
own their bytes. Finalization is a fallback with no deadline guarantee.

| Wasm heap | Ownership and retention |
|---|---|
| `pool` (default) | One document per checked-out instance; reuse after disposal; eight idle instances / 16 MiB total idle capacity |
| `document` | Fresh instance per document; disposal drops runtime references; host GC reclaims backing memory |
| `global` | Shared instance with separate document arenas; freed arenas are reusable, but linear-memory high water cannot shrink |

Idle limits do not cap active documents. Oversized/overflow instances are dropped
for host GC. Zero idle count/bytes disables reuse. No library threads or shared
memory are involved. Worker environments own their documents and pools separately.

Wasm starts with 1 MiB memory, a 32 KiB linear stack and 16 KiB fixed transfer
scratch. Larger transfers use document buffers. Non-shared memory growth detaches
old JS views, which are refreshed before access. The native allocator uses
thread-local ownership/accounting and loader-initialized Lexbor allocator hooks.

Stable IDs are not recycled during a document lifetime. Observed detached nodes
remain retained intentionally. Selector plans have a bounded document cache;
values and buffers reuse capacity. Repeated renaming can retain empty prior
interfaces and remains a documented workload limitation.

Relative selector-list ordering does not register unrelated descendants. Its
reusable ordering scratch scales with the matched set; actual retained selections
continue to keep their detached nodes valid. Sparse and dense query/empty/refill
regressions check that unobserved replaced subtrees reuse capacity.

Raw `firstChild` and `lastChild` reads register only the requested child. Retained
handles keep their own identity through replacement without exposing all siblings.
Load options and facade construction finish before allocating the kernel owner;
throwing getters leave no live document, including without finalization support.

Static `until` traversals expose only returned nodes; containment checks expose
no intermediate ancestors. Node handles allocate stable single-ID arrays only
when needed. Immediate attribute/text callbacks share a borrowed array without
sharing the IDs of retained selections.

Live `attribs` enumeration caches one private attribute map per document until
the next mutation or disposal. This trades retention of the most recently
enumerated values for fewer boundary calls; it is not a byte cap or a total
JavaScript heap guarantee. Other attribute snapshots returned to callers are
independent of that cache.

## Verification scope

Developer diagnostics measure live documents, backing bytes, allocations and
Wasm retained capacity. Tracking/statistics are outside release JS. Counters are
not total JS heap/RSS or proof of absence of fragmentation.

`bench/memory-stress.mjs` contains fixed authored lifecycle budgets. **Providing a
custom corpus disables those budgets**; report such runs separately. The prior
checkpoint passed 2,430 authored lifetimes per backend. Zero live bytes after
disposal is not proof of immediate OS reclamation.

After the architecture split, four fixed-budget 24-cycle runs passed with zero
final live/control bytes. These shorter runs do not replace the earlier
120-cycle evidence. Fresh and trimmed-pool capacity returned to zero; shared
memory retained its high-water capacity.

The relative-list correction repeats all four 24-cycle authored-budget checks,
with the custom corpus disabled, and separately checks eight sparse/dense
query/empty/refill cycles. Both checks preserve intentionally retained handles.

The 0.1.2 insertion/ownership correction repeats the longer **120-cycle run with
2,430 document lifetimes** on all four backends, with all fixed budgets and plateau
assertions passing:

| Backend | Peak tracked backing bytes | Peak Wasm capacity | Final tracked live / control bytes |
|---|---:|---:|---:|
| Native | 22,521,160 | — | 0 /0 |
| Pooled Wasm | 12,849,224 | 23,003,136 | 0 /0 |
| Global Wasm | 12,849,224 | 14,286,848 | 0 /0 |
| Per-document Wasm | 12,849,224 | 16,777,216 | 0 /0 |

Fresh and trimmed-pool capacity returns to zero; global memory retains its
14,286,848-byte high water for reuse. A separate repeated-input probe covers 257
document lifetimes, 128 retained disposed selections and 6,096 edits per backend.
Its long-lived insertion loop makes no additional backing-allocation requests
after warmup, and final tracked live/control bytes are zero after handles are
released. Before/current output hashes, logical calls, returned ID counts and
backing-allocation counts match for five ordinary workloads on native and pool.
These counters do not measure all JavaScript allocations or immediate RSS release.

The subsequent fragment/load/child/form fixes repeat all four 120-cycle budgets
with the same peaks and final zero live/control bytes shown above. A separate
12-cycle probe replaces 1,024 children each cycle and reads one edge. Each side
now creates **12 wrappers instead of 12,288**. Native backing capacity plateaus at
1,671,040 bytes; pooled Wasm plateaus at 1,162,300 bytes for first-child reads and
1,149,416 for last-child reads. These are document backing bytes, not total process
memory. Both versions release document backing on disposal; the correction removes
avoidable retention during the document lifetime. Ordinary output, kernel-call,
returned-ID and backing-allocation counts match the preceding checkpoint on five
workloads per native/pool backend.

The API optimizations repeat all four 120-cycle authored budgets with the same
peaks and final zero live/control bytes. Fresh and trimmed-pool capacity again
returns to zero. The traversal and containment probes avoid temporary handles;
the live attribute cache retains one map per document, so these checks still do
not bound the total JavaScript heap.

`test/faults.c` injects failures into GroveDOM-owned buffer growth for input,
transfer, query results and serialization, then checks recovery and idempotent
cleanup. It does not inject every upstream Lexbor or host allocation failure.
Native ASan/UBSan and deterministic fuzzing complement those checks.

[Historical memory results](history/memory.md) retain exact capacity measurements,
controls and earlier limitations. [Compatibility](compatibility.md) defines the
current support contract.
