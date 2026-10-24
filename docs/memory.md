# Ownership and memory

Explicit `$.dispose()` clears pending commands, releases kernel ownership and
invalidates retained selections and node handles. Returned strings and snapshots
own their data. Finalization is a fallback with no deadline guarantee.

| Wasm heap | Ownership and retention |
|---|---|
| `pool` (default) | One document per checked-out instance; reuse after disposal; eight idle instances / 16 MiB total idle capacity |
| `document` | Fresh instance per document; disposal drops runtime references; host GC reclaims backing memory |
| `global` | Shared instance with separate document arenas; freed arenas are reusable, but linear-memory high water cannot shrink |

Idle limits do not cap active documents or total process memory. Oversized/overflow
instances are dropped for host GC; zero idle count/bytes disables reuse. Workers
own independent documents and pools. GroveDOM creates no threads or shared memory.

Wasm starts with 1 MiB memory, a 32 KiB linear stack and 16 KiB transfer scratch.
Large transfers use document buffers. Growth detaches old views, which the binding
refreshes before access. Native allocator ownership/accounting is thread-local;
Lexbor's allocator hooks are initialized once by the loader.

## Retention rules

- IDs are never recycled within a document. Observed detached subtrees remain
  valid until disposal; unobserved replaced subtrees return to Lexbor pools.
- Raw edge reads register only the requested child. Static `until` returns only
  accepted nodes, and containment registers no ancestors. Relative-list ordering
  does not expose unrelated descendants.
- Node singleton arrays are lazy. Immediate callbacks borrow a separate array and
  reacquire it after user code; retained selections never share that scratch.
- Live `attribs` enumeration retains one private map per document until mutation
  or disposal. It has no byte cap; caller-visible attribute snapshots are independent.
- Selector plans have a bounded per-document cache; values and buffers reuse
  capacity. Repeated renaming can retain empty prior interfaces until disposal.
- Load options and facade construction finish before allocating an owner, so a
  throwing getter cannot strand a document even without finalization support.

## Verification scope

Diagnostics track document backing allocations and Wasm capacity, not total JS
heap, RSS, immediate OS reclamation or absence of fragmentation. They do not ship
with release JavaScript.

The final 0.1.2 pre-release check repeats **120 cycles / 2,430 document lifetimes**
on all four backends, passing fixed capacity and plateau assertions with custom
inputs disabled. Final tracked live/control bytes are zero. Fresh and trimmed
pool capacity returns to zero; global memory retains its high water for reuse.

`bench/memory-stress.mjs` contains the authored budgets. **A custom corpus disables
those budgets** and must be reported separately. Configure the backend as in
[setup](prototype.md#checks), then run:

```sh
GROVEDOM_CORPUS_MANIFEST= GROVEDOM_MEMORY_CYCLES=120 \
  node --expose-gc bench/memory-stress.mjs
```

[Earlier lifecycle measurements](history/memory.md#012-lifecycle-checkpoints)
preserve exact peaks, the 257-lifetime repeated-input probe and the child-retention
correction. Those counts are distinct from total JavaScript allocation or RSS.

[Fault injection](../test/faults.c) checks owned input, transfer, query-result and
serialization growth failures, retries and idempotent cleanup. It does not cover
every upstream Lexbor or host allocation failure. Native ASan/UBSan with leak
detection and seeded fuzzing complement these checks; see
[current qualification](testing.md#current-qualification).
