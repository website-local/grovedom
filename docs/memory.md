# Memory and backend assessment

The Wasm-first investigation adds inspector allocation sampling and warmed
retention snapshots on the fixed consumer corpus. Initial native/pooled runs
estimated about 1.95–1.98 GB of cumulative JS allocation over 160 corpus replays;
consumer transforms, URL processing, strings and promises dominated. This is
sampled allocation volume, not simultaneous live memory or Wasm arena usage.
Snapshots showed no accumulating node/selection wrappers, stable typed-array
counts, and zero live document/control bytes after GC and disposal. Trimming the
idle pool reduced its owned linear memory to zero. Engine code/metadata accounted
for much of the remaining heap growth. These observations identify retention
sites; they do not prove absence of allocator fragmentation.

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

## XML optimization recheck

The pass after `8c785fb` adds a lazy, fixed 64-entry name cache in the existing XML document arena: 2 KiB of entries on native and 1 KiB on Wasm, plus arena bookkeeping. Entries borrow interned names/IDs; they do not own nodes or command/input storage. HTML does not allocate this cache. The control record adds one pointer, cleared on disposal. Callback setters avoid temporary internal selections, scalar reads avoid transporting a one-element selection array, and matching command views are reused and cleared on disposal.

The same 2,430-lifetime matrix passes all unchanged budgets. Peak tracked capacity rounds to 21.48 MiB native and 12.25 MiB Wasm; peak shared/fresh/pooled linear capacity remains 14.0625/16.375/22.4375 MiB. Shared capacity plateaus, live DOM/control bytes return to zero, and fresh ownership plus trimmed pool capacity return to zero. Native ASan/UBSan with leak detection passes the 709-case suite without a report. These checks cover exercised lifetimes and allocator reuse, not a general proof against fragmentation.

The release native artifact changes from 1,315,728 to 1,316,384 bytes and Wasm from 793,436 to 794,245 bytes. Release Wasm retains zero imports and no diagnostic exports. Stack, initial heap, shared transfer storage and pool limits are unchanged.

### XML callback array lifetime

The callback-allocation follow-up delays single-ID arrays for XML handles until an actual selection or node operation needs stable storage. Immediate callback reads and writes borrow one document-owned array. They reacquire it after user callbacks and string coercion, which can reenter the same document. Disposal clears the borrowed array; retained selections keep their own stable IDs and remain invalid after disposal.

Measured single-ID array creation drops from 601 to two on the large sitemap replay and from 301 to two on the large SVG replay. This removes 599/299 arrays without changing kernel arenas or retaining input-buffer aliases. It does not eliminate node wrapper/record allocations or measure total JS heap bytes.

The 711-case matrix and rebuilt native ASan/UBSan suite pass, with no sanitizer reports. The authored 2,430-lifetime panel passes every existing budget on all four backends: peak tracked capacity remains 21.48 MiB native and 12.25 MiB Wasm, and peak shared/fresh/pooled capacity remains 14.0625/16.375/22.4375 MiB. Live document/control bytes return to zero; fresh and trimmed-pool capacity return to zero. Separate refreshed-MDN runs pass their lifecycle assertions. Custom-corpus runs disable the authored capacity limits, so those runs are diagnostics, not passes against the authored memory budgets.

### Attribute value retention

The follow-up after `62a6341` fixes in-document retention when attached attributes grow. Lexbor's enabled change-callback path bypasses its old-value cleanup. XML now disables irrelevant internal HTML hooks; the shared growing-value fallback preserves HTML callbacks and releases the old buffer afterwards. Allocation failure retains the previous owned buffer. Existing in-place capacity reuse remains unchanged. The [source audit](research.md#xml-and-template-implementation-findings) records the dependency coupling.

A separate probe grows 32 distinct attributes through 32 writes each, from 512 bytes to 16 KiB, keeping all final values live and verifying their contents. Final payload is 512 KiB. Tracked capacity includes document arenas and transfer buffers, not just the live string bytes.

| Input mode | Native before / after, bytes | Shared Wasm before / after, bytes | Wasm linear capacity before / after, bytes |
|---|---:|---:|---:|
| HTML | 8,064,832 / 2,350,208 | 7,519,804 / 1,807,964 | 7,929,856 / 2,228,224 |
| XML | 7,292,184 / 1,577,560 | 7,124,212 / 1,412,372 | 7,536,640 / 1,835,008 |

Both versions return tracked live document bytes to zero on disposal. The defect retains storage during the document lifetime; it is not a demonstrated leak after disposal. Repeatedly growing and deleting just one attribute did not expose it because that probe reused freed storage. The regression tests keep all 32 final values live and assert less than 2 MiB of additional tracked capacity, allowing arena/transfer slack. Both tests fail against the previous checkpoint and pass on every backend with the fix.

The direct single-tag scan adds no cache, document field or per-node allocation. The 716-case matrix and rebuilt native ASan/UBSan suite pass without sanitizer findings. The authored 2,430-lifetime panel passes every unchanged budget on all four backends. Peak tracked capacity remains 21.48 MiB native / 12.25 MiB Wasm; shared/fresh/pooled linear capacity remains 14.0625/16.375/22.4375 MiB. Live document/control bytes return to zero, as do fresh ownership and trimmed-pool capacity. Separate refreshed-corpus runs pass lifecycle assertions. These checks do not establish general allocator-fragmentation bounds.

### Lazy CSS setup and combined Wasm observations

The follow-up after `4d33ee8` creates CSS parser/matcher state only for queries that need it. Plain ASCII tag queries reuse existing tag tables and preorder scans; they add no persistent index, cache or per-node allocation. The first `use` query on the authored SVG-300 input needs six backing allocation requests instead of 36. The full SVG replay needs 153 instead of 234 requests on native and 135 instead of 216 on shared Wasm. These counts exclude JS objects and allocator slack.

Fresh processes containing only that full SVG replay confirm the peak reduction:

| Backend | Tracked peak before / after, bytes | Linear capacity before / after, bytes |
|---|---:|---:|
| Native | 1,183,416 / 928,568 | — |
| Shared Wasm | 686,236 / 583,020 | 1,179,648 / 1,048,576 |

Both finish with zero live document bytes. Native's 1,664-byte control record remains until owner finalization in this immediate sample; the sustained GC/lifetime checks separately verify its release. Earlier probes that queried another document first are not used to establish these single-replay peak figures.

Wasm's combined mutation/read export uses the existing 16 KiB instance scratch area or document-owned overflow transfer buffer. It adds no independently retained buffer. Commands, IDs, payload and the read name coexist until the call finishes; installing the name after executing commands prevents fragment parsing from overwriting it. JS checks the combined transfer length before narrowing it to Wasm's address space.

The authored 2,430-lifetime matrix passes every unchanged budget on all four backends. Peak tracked capacity remains 21.48 MiB native / 12.25 MiB Wasm. Shared/fresh/pooled linear peaks fall from 14.0625/16.375/22.4375 MiB to 13.75/16/21.875 MiB. Live document/control bytes return to zero, as do fresh ownership and trimmed-pool capacity. Refreshed-corpus lifecycle checks and rebuilt native ASan/UBSan with leak detection also pass. These remain scoped capacity measurements, not general fragmentation bounds or guarantees of immediate OS reclamation.

### Audited 32 KiB stack and view refresh

The follow-up after `7bdfdfc` halves the Wasm stack reservation from 64 KiB to 32 KiB. The [recursion audit](stack.md) and two compiler configurations reach a maximum observed pointer depth of 6,256 bytes across 48 workloads with two sentinel patterns. The released reservation becomes allocator headroom; initial memory stays 1 MiB and grows in 64 KiB pages.

| Wasm mode | Peak linear capacity before / after |
|---|---:|
| Shared | 13.75 / 13.75 MiB |
| Fresh per document | 16 / 15.8125 MiB |
| Pool | 21.875 / 21.6875 MiB |

The same authored 2,430-lifetime panel passes every existing budget. Each mode still makes 612,985 tracked allocation requests and peaks at 12,849,224 tracked bytes. Live documents, document bytes and control bytes return to zero; fresh ownership and trimmed-pool capacity also return to zero. Separate refreshed-corpus diagnostics pass their lifecycle assertions. The 192 KiB reductions in fresh/pool peak capacity are aggregate workload observations, not a per-instance page-saving promise.

The Wasm binding also avoids repeatedly reading the engine's memory-buffer getter. Growth of its non-shared memory detaches the cached buffer and makes its byte-view length zero; that triggers rebuilding the existing byte/word views. Growth by another document in the shared instance follows the same rule. This adds no buffer, field or cache, and disposal still clears the views. Node 22 checks pass on all three heap modes, with pooled Wasm also checked on Node 24. Native code and allocation behavior are unchanged by this follow-up.

## Wasm-first allocation and lifetime recheck

The selector summary uses 256 bytes from the document arena, allocated only when
a whole-document template query actually examines a class or ID condition.
Pure tag/attribute lists do not build it. Scoped queries bypass it, and disposal
clears the pointer with the other arena references. The memory helpers add no
allocation or retained storage.

The first candidate enlarged the Wasm document control record to 912 bytes.
Tracked live backing capacity stayed flat, but shared-heap capacity gained one
64 KiB page at the end of the 500-replacement pinned-owner test, failing its
plateau assertion. Grouping five flags as ordinary C booleans reduces the record
to 896 bytes and restores that unchanged assertion. No packing extension, new
allocator, relaxed budget or extra retained object is introduced. This illustrates
how small allocation-layout changes can affect allocator reuse.

The selected code passes the authored 2,430-lifetime budgets on every backend:

| Backend | Peak tracked bytes | Peak owned linear capacity | Final live/control bytes | Capacity after trim |
|---|---:|---:|---:|---:|
| Native | 22,521,160 | — | 0 / 0 | — |
| Shared Wasm | 12,849,224 | 13.75 MiB | 0 / 0 | 13.75 MiB |
| Fresh Wasm | 12,849,224 | 15.8125 MiB | 0 / 0 | 0 |
| Pooled Wasm, eight idle slots | 12,849,224 | 24.4375 MiB | 0 / 0 | 0 |

The idle-instance default increases from four to eight while retaining the
16 MiB idle-byte cap. Across 40 complete consumer replays, four slots create
124 instances, including three recurring creations per replay after warmup.
Eight slots create five instances in total and need no recurring creation.
Idle capacity rises from 8 MiB to 9.125 MiB; both configurations trim to zero.
The fixed paired comparison and repeat give a 1.053 raw / 1.056 filtered ratio,
with a 0.984 identical-code control and eight of twelve blocks retained. The
retained range includes a 0.976 block, so this is not a universal gain.

In the authored lifetime budget above, the eight-slot pool raises peak aggregate
capacity from 21.6875 to 24.4375 MiB. The existing 32 MiB ceiling and all plateau
assertions remain unchanged and pass. These peaks include active instances;
the idle-byte cap does not limit total active-document memory.

Separate saved-corpus lifecycle diagnostics also pass, including the eight-slot
pool. Those custom-corpus runs disable the authored fixed budgets and are not
additional budget passes. An extended shared-heap
diagnostic keeps the three pinned owners while performing 5,000 replacements.
Capacity eventually reaches 14.125 MiB, 384 KiB above the shorter test's peak,
then remains unchanged from the sample at replacement 2,140 through 5,000. It
stays under the existing 16 MiB ceiling and releases all live/control bytes.
This is bounded observed convergence, not proof of zero holes or fragmentation.

Inspector sampling of the selected kernel with the former four-slot pool
estimates about 1.94 GB native and 1.97 GB pooled JS allocation over 160 consumer
replays. Three GC/trimmed snapshots over 240 replays
show no accumulating node/selection wrappers and stable typed-array counts;
engine code and metadata explain most residual growth. Native ASan/UBSan with
leak detection passes the full suite and all three fuzz modes. The final fuzz
matrix executes 1,000 valid, 1,000 malformed and 1,000 template-focused cases on
native, three Wasm heaps and sanitized native: 15,000 case executions, including
repeated seeds across backends. The eight-slot pool also passes 1,000 cases in
each mode, bringing this validation sequence to 18,000 executions. Every case
checks zero live document/backing bytes after cleanup. These bounded checks complement explicit disposal; they do
not promise prompt GC or exhaustive malformed-input coverage.

## Reproduction

Use existing dependencies and approved disk-backed temporary/cache/build directories. Run memory diagnostics separately from release timing.

```sh
GROVEDOM_MEMORY_CYCLES=120 node --expose-gc bench/memory-stress.mjs
GROVEDOM_BACKEND=wasm GROVEDOM_WASM_HEAP=pool GROVEDOM_MEMORY_CYCLES=120 \
  node --expose-gc bench/memory-stress.mjs
```

Repeat for `global` and `document`. `GROVEDOM_MEMORY_ENTRY` selects an isolated source snapshot, paired with its matching build directories. `GROVEDOM_CORPUS_MANIFEST` optionally adds saved inputs. Keep raw reports and private manifests outside the public repository.

## Backend guidance

Pooled Wasm is the current primary optimization target; native remains a required comparison rather than an assumed winner. The performance panel and its limits are recorded in [benchmarks](benchmarks.md). Retain explicit disposal at the complete transform/serialization boundary, including errors. Independent caller-managed workers each own their documents; this work introduces no threads.

For a portable Wasm deployment, a bounded pool offers capacity reuse while allowing idle memory to be discarded. Shared Wasm has lower aggregate capacity in this mixed workload but retains its high-water mark. Fresh heaps provide simple isolation and drop library ownership promptly, with repeated instantiation costs and GC-dependent physical reclamation. Keep all three as measured experiments for now; this pass changes the idle-slot default but does not select a shipping backend or change initial-memory/stack sizes.
