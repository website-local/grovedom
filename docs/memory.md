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

`test/faults.c` injects failures into GroveDOM-owned buffer growth for input,
transfer, query results and serialization, then checks recovery and idempotent
cleanup. It does not inject every upstream Lexbor or host allocation failure.
Native ASan/UBSan and deterministic fuzzing complement those checks.

[Historical memory results](history/memory.md) retain exact capacity measurements,
controls and earlier limitations. [Compatibility](compatibility.md) defines the
current support contract.
