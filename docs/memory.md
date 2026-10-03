# Memory and backend assessment

This pass starts from `2c3c16e`. It measures explicit disposal and bounded reuse on deterministic workloads. It does not establish a universal fragmentation bound, an RSS limit, or production readiness.

## What the counters mean

- `liveBytes` counts outstanding kernel backing allocations, including allocator tracking headers. It includes unused arena slots and reusable buffer capacity; it is not the size of reachable DOM payload alone.
- `controlBytes` separately counts document control structures, including closed native records waiting for owner finalization. These were previously absent from the memory report. Native records can survive explicit disposal briefly; the facade now drops its owner reference so retained selections do not retain them.
- Wasm `memoryBytes` counts linear memory still owned by live runtimes or the idle pool. It includes static data, stack, allocator metadata, free blocks and arena slack. Subtracting `liveBytes` does **not** measure fragmentation. Unreachable instances awaiting host GC are outside this ownership counter.
- Process RSS, external memory, ArrayBuffers and JS heap are sampled before and after a diagnostic GC turn. OS allocator retention and host GC make these observations unsuitable for deterministic assertions. Peak library capacity is sampled at operation boundaries; process samples are not a continuous peak monitor.

## Sustained mixed lifetimes

`bench/memory-stress.mjs` runs eight simultaneous documents drawn from small, medium and large authored HTML, a 600-entry sitemap and a 240-group SVG. It opens holes in a fixed varied disposal order and inserts a small document between releases. The verification run uses 120 cycles, followed by 500 owner replacements with three documents kept alive throughout, and two 800-replacement mutation cases: 2,430 complete document lifetimes. Disposed selections deliberately survive until a later phase. No timing conclusions come from this harness.

| Backend | Peak tracked backing allocations | Peak owned Wasm capacity | Capacity after disposal | After pool trim |
|---|---:|---:|---:|---:|
| Native | 21.48 MiB | — | 0 live DOM bytes | — |
| Wasm shared | 12.25 MiB | 14.00 MiB | 14.00 MiB | 14.00 MiB |
| Wasm fresh per document | 12.25 MiB | 16.38 MiB | 0 | 0 |
| Wasm pool | 12.25 MiB | 22.44 MiB | 11.00 MiB idle | 0 |

Native's wider pointers and structure layouts contribute to its larger backing allocations. All four modes return live DOM allocations to zero after every mixed cycle. Control bytes also reach zero after the diagnostic GC turn, including with disposed selections retained. Shared Wasm plateaus at 12.81 MiB in the fully disposed cycles. Pinned owners then change allocator reuse: capacity rises to 14.00 MiB despite constant live backing capacity, and plateaus through replacement 500. This is evidence that allocation layout matters, not that arenas eliminate fragmentation. Pool idle count and bytes remain bounded by the existing four-instance / 16 MiB limits.

Unobserved child replacements plateau at 1.25 MiB native / 0.71 MiB Wasm backing capacity. When each removed child is retained through a selection, capacity rises through the 800 replacements to 2.76 MiB / 1.89 MiB. Those nodes remain readable and are released on document disposal. This is required ownership, not a leak; long-lived mutation workloads must budget for retained detached nodes.

The authored harness enforces these regression ceilings:

| Budget | Limit |
|---|---:|
| Native tracked live capacity | 24 MiB |
| Wasm tracked live capacity | 14 MiB |
| Shared Wasm owned linear capacity | 16 MiB |
| Fresh Wasm owned linear capacity | 24 MiB |
| Pooled Wasm owned linear capacity, including idle instances | 32 MiB |

These are workload-specific test limits, not automatic application limits or promised per-document costs. Optional private corpora are reported separately without applying the authored size ceilings. More input sizes, allocation-failure injection and long-running production lifetimes remain necessary before claiming a general memory gate.

## Selector optimization recheck

The pass after `3fd1609` adds selector rejection metadata to the existing bounded CSS arena, with one allocation per eligible plan and no per-element allocations during matching. Repeating the same 2,430-lifetime stress matrix passes every existing budget. Peak tracked backing capacity remains 21.48 MiB native and 12.25 MiB Wasm. Fresh and pooled peaks remain 16.38 and 22.44 MiB of linear capacity. Shared Wasm reaches 14.06 MiB, one additional 64 KiB page, then plateaus through the pinned-owner replacements. Live DOM and control bytes return to zero; fresh ownership and a trimmed pool return to zero capacity. The earlier 14.00 MiB measurement remains a useful comparison, not a promise that every allocation layout has the same high-water mark.

The metadata has a small measurable cost: native backing-allocation requests per MDN-1/5/8 replay rise from 229/1,188/536 to 231/1,196/540, with 4,144/16,576/8,288 additional requested bytes respectively. Those replays can own several documents. The guard allocates its metadata when a plan is created; its per-element checks allocate no storage. The profiled SVG and sitemap paths keep their previous allocation counts. Control records separately include the added cached-plan pointers.

The 700-case matrix passes across all backends, with native and pool also tested on Node 24. Direct Node execution of the native ASan/UBSan suite with leak detection emits no findings. An initial run preloading the sanitizer into the npm driver emitted V8 allocation leak reports after the tests passed; those reports contained no kernel allocation frames. The clean verification uses `node --test` directly and preserves the initial diagnostic rather than suppressing reports.

## Reproduction

Use existing dependencies and approved disk-backed temporary/cache/build directories. Run memory diagnostics separately from release timing.

```sh
GROVEDOM_MEMORY_CYCLES=120 node --expose-gc bench/memory-stress.mjs
GROVEDOM_BACKEND=wasm GROVEDOM_WASM_HEAP=pool GROVEDOM_MEMORY_CYCLES=120 \
  node --expose-gc bench/memory-stress.mjs
```

Repeat for `global` and `document`. `GROVEDOM_MEMORY_ENTRY` selects an isolated source snapshot, paired with its matching build directories. `GROVEDOM_CORPUS_MANIFEST` optionally adds saved inputs. Keep raw reports and private manifests outside the public repository.

## Backend guidance

Native remains the leading candidate for a Node deployment; the performance panel and its limits are recorded in [benchmarks](benchmarks.md). Retain explicit disposal at the complete transform/serialization boundary, including errors. Independent caller-managed workers each own their documents; this work introduces no threads.

For a portable Wasm deployment, a bounded pool offers capacity reuse while allowing idle memory to be discarded. Shared Wasm has lower aggregate capacity in this mixed workload but retains its high-water mark. Fresh heaps provide simple isolation and drop library ownership promptly, with repeated instantiation costs and GC-dependent physical reclamation. Keep all three as measured experiments for now; this pass does not select a shipping backend or change heap/stack defaults.
