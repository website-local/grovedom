# Design and feature set

This document describes the target design. The [native prototype](prototype.md) implements a tested subset; unsupported behavior and remaining comparisons are listed there.

## Scope and priorities

GroveDOM provides a mutable HTML DOM and a JavaScript facade suitable for replacing the required Cheerio operations in `website-scrap-engine`. The first acceptance workload is the MDN offline transformation pipeline.

Priorities, in order:

1. Meet the agreed ≥3× complete-DOM performance gate on normal successful workloads.
2. Preserve the parsing, mutation, selector, callback, and output behavior those workloads require.
3. Beat the fastest compatible Cheerio configuration with parse5 or htmlparser2 on the same full workload.
4. Keep implementation, ownership, protocol, toolchain, and maintenance simple. Memory discipline and straightforward migration are acceptance requirements, not optional later optimizations.

The downloader retains networking, URL policies, CSS URL rewriting, scheduling, and lifecycle hook ordering. The DOM package has no MDN-specific selectors, locale logic, resource fetching, or download policies.

### Simplicity constraints

Use one JS/TypeScript facade, a small sequential command dispatcher, and the selected kernel's existing parser/tree/selector facilities. Compare candidates with small prototypes, then select one production kernel/binding initially; do not build a plugin framework or maintain every candidate as a shipping backend. Add abstractions only when the actual implementation needs them.

Run synchronously on the calling JS thread, whether it is the main thread or a caller-managed Node worker. Callers may use several workers concurrently with independent documents. Each document and its handles belong to the creating environment; they cannot be shared or transferred between workers. Several documents may also be live on one thread, including nested `iframe[srcdoc]` documents and documents awaiting hooks. GroveDOM introduces no threads, worker pool, atomics, `SharedArrayBuffer`, or parallel scheduler. Callback reentry still requires scoped scratch storage and correct document ownership. Native mutable state must be document-, environment-, or thread-local, with shared initialization completed before concurrent calls begin.

Use Node scripts for build orchestration, fixtures, benchmarks, and reports. Prefer a direct C compiler/linker plus Node-API headers for C/native, or Clang/wasm-ld plus the necessary sysroot for C/Wasm. Reuse an upstream build system if it is simpler than maintaining our own source list. A selected Rust backend uses Cargo and its required target tools; avoid a Rust wrapper around C that needlessly requires both stacks. No Python, node-gyp, Emscripten, binding generator, or extra build layer by default. Introduce Python only if a required dependency has no reasonable simpler route, and record the reason. Consumers should use prebuilt artifacts without a compiler or Python.

### Node.js support decision

The minimum is **Node.js 22.0.0**, with planned package metadata `engines.node: ">=22.0.0"`. Initially validate the latest patched releases of maintained Node 22 and 24 lines, plus an install/load/API smoke check at the declared 22.0.0 floor. Recommend current patched releases for actual use. Add newer maintained LTS lines to the matrix as they become relevant; do not imply that an engines range is evidence that every future runtime has been tested.

Node 18 reached end of life on 2025-04-30; Node 20 followed on 2026-04-30. Node 22 is maintained until 2027-04-30, while Node 24 is maintained until 2028-04-30. Cheerio 1.2.0 also already requires Node >=20.18.1. Supporting Node 18 would add an obsolete compatibility target and an unsupported baseline installation. These dates come from the [Node release schedule](https://github.com/nodejs/Release/blob/main/schedule.json).

`FinalizationRegistry` and ordinary Node-API finalizers predate Node 22; the minimum limits support and maintenance costs. Use only stable APIs available at the declared floor; no experimental finalizer APIs, mandatory `using` syntax, or newer-runtime polyfills. Keep the Node-API compilation target within that floor.

## Execution model: ordered operations and flush

Maintain one ordered stream per document. Operations can reference earlier operation results through internal selection/result handles. Execute the stream sequentially, with no speculative or out-of-order execution.

For example:

```text
s0 = SELECT("a.external")
SET_ATTR(s0, "target", "_blank")
ADD_CLASS(s0, "offline")
RETURN_COUNT(s0)
```

The first three operations need not expose a node or string to JavaScript. The count is an observation and causes the necessary work to execute.

Start with a simple interpreter and coarse operations over entire selections. Benchmark direct selection-level calls against transparent buffering through the same facade. Users should not need to rewrite Cheerio chains into a batch DSL. Buffering is an execution model, not evidence of a speed improvement by itself.

### Preserve selection snapshots

```js
const links = $('a');
$('body').append('<a href="/new">new</a>');
links.remove(); // The newly inserted anchor must survive.
```

Record selection creation at its original position in the stream, or materialize it then. Do not store only selector text and re-evaluate membership later. Keep node identity stable while allowing later mutations to affect those selected nodes.

Do not queue independent chains in independent buffers: aliases and cross-chain mutation require a document-wide order.

### Observation boundaries

Flush when an operation must expose pending kernel state:

- Attribute, property, text, or HTML getters.
- Selector predicates that return booleans.
- Selection length, indexing, or iteration when the required selection has not been materialized.
- Computing current values passed to callbacks; DOM reads inside callbacks must observe preceding writes.
- Explicit `flush()` and document serialization/finalization.
- Any documented escape hatch to the backend.

A known snapshot length or a JavaScript-side `.eq()` over already materialized handles may need no kernel call. A callback receiving only a snapshot node identity also needs no extra flush at entry: live getters flush before observing the DOM. Reads should not blindly flush when the needed result is already valid. The prototype combines pending writes and a following read into one Node-API or Wasm call, retaining their original execution order and safety checks. Wasm packs operands into its existing transfer storage and installs the read name after executing mutations, since fragment parsing can replace the input buffer.

An `await` is not intrinsically a flush. Keep issue order consistent across asynchronous hook resumptions and never hold native borrows across JavaScript callbacks or asynchronous suspension. The engine adapter may conservatively flush at lifecycle boundaries.

### Error behavior

Exact invalid-input behavior, error text, and incidental Cheerio error quirks are not adoption requirements. Do not add hot-path cost or architectural complexity merely to reproduce them. Bounds checks, safe ownership, and cleanup on failure remain required.

A batch is not a transaction. Report the failing operation, preserve already-applied effects, discard unexecuted commands and their result handles, and release scratch storage. Do not silently retry mutations. Document whether each failing mutation primitive can leave partial effects; do not promise rollback.

Deferred execution can change exception timing. Decide which inputs, such as invalid selectors, must be validated at call time and which errors surface at flush. Record this compatibility decision before promising drop-in behavior.

### Small private operation protocol

Initial representation to measure:

- A reusable flat typed buffer with a small opcode enum and fixed operands per opcode. The submission call supplies the document handle and used buffer lengths.
- A reusable UTF-8 payload buffer; strings use offset/length pairs. Use integer handles for existing selections and reusable selector plans.
- Kernel-owned selections and intermediate strings, with result slots only for values JavaScript actually observes.
- The same logical dispatcher behind a thin Node-API entry point or direct Wasm export. Transport-specific copying stays in that binding.

No magic header, protocol version, checksums, capability negotiation, schema framework, persistent bytecode files, or stable internal ABI promise. Do not create a per-command JS object graph. Keep ordinary memory-safety checks: buffer bounds, offset arithmetic, allocation failure, and document/handle ownership. These protect execution; they are not protocol evolution machinery.

Ship JS glue and the selected Node-API or Wasm kernel together with the same **major.minor** package version. Prefer exact matching artifacts from one build; sharing a minor version does not promise that arbitrary patch artifacts are interchangeable. Use package metadata and exact dependency resolution for pairing, rejecting a mismatched pair at installation/loading rather than adding a version field to every batch. There is no independently versioned kernel protocol. Node-API's own Node runtime compatibility does not promise compatibility between GroveDOM glue and kernel revisions.

Finalize operand widths and buffer growth only after measuring construction, encoding, copying, dispatch, and output. Maintain a small opcode table and cross-binding fixtures; add a Node-based generator only if duplication actually warrants one.

## Cheerio API and TypeScript compatibility

The primary public API is Cheerio-shaped, with `load(content, options?, isDocument?)` returning a callable `$`. Support selector/context overloads, markup and node inputs, static helpers such as `$.root()`/`$.html()`, chainable collection methods, indexing, iteration, and callback signatures as required by the inventory. Document/Selection handles are internal implementation objects, not a replacement programming model imposed on callers.

The intended migration for supported code is an import change, with deterministic cleanup added at the document owner:

```ts
import { load } from 'grovedom'; // Previously from 'cheerio'.

function transform(input: string) {
  const $ = load(input);
  try {
    $('a.external').attr('target', '_blank').addClass('offline');
    return $.html();
  } finally {
    $.dispose(); // GroveDOM extension; the engine adapter owns this boundary.
  }
}
```

`$.flush()` is an optional extension; normal getters, callbacks, and serialization provide the necessary flushes. Preserve Cheerio overload behavior, return types, first-element getters, chain results, callback `this`/index/node arguments, early termination, and selection snapshots. Numeric indexing and iteration are observations and may materialize the required handles. A compatibility mechanism such as a JS Proxy must earn its cost in the complete replay; avoid eagerly mirroring the entire DOM as JS objects.

### Reuse typedefs without claiming unsupported behavior

Cheerio 1.2.0 ships its own declarations. Reuse its public type exports through `import type`/`export type`; do not introduce `@types/cheerio`, load Cheerio at runtime just to use its types, or deep-import private declaration files. Ensure the chosen Cheerio type dependency is available to downstream TypeScript consumers, not only to this package's development build.

- Reuse compatible helper types directly, such as `SelectorType` and `FilterFunction<T>`. Reuse option properties and method overloads where their full behavior is supported.
- Reuse `Cheerio<T>` and `CheerioAPI` wholesale only if their declared surface, node contracts, and chained returns are implemented. Otherwise expose a narrow, accurate GroveDOM facade using compatible upstream types, with only the necessary local declarations. A plain `Pick<Cheerio<T>, ...>` is insufficient when methods return full `Cheerio` objects or constrain `this` to them.
- `CheerioOptions` includes parser-specific callbacks/adapters and XML options. Accept the audited options and preserve defaults; reject unsupported options explicitly. Do not publish the whole options type while silently ignoring fields.
- Cheerio's node-facing API uses `domhandler` types. Audit actual reads/writes of `name`, `tagName`, `attribs`, `parent`, `children`, sibling links, and node methods. Reuse `AnyNode`/`Element` types only when the wrapper implements their promised behavior. Type assertions cannot turn integer handles into compatible node objects.
- Create JS node wrappers only when observed, cache identity within the document, and route supported reads/writes through ordered flush boundaries. Plain snapshots of mutable fields cannot stand in for live node access. Avoid building a general mirror of all domhandler internals without a demonstrated requirement.

Compile representative unchanged consumer functions against the facade and run them through the same differential replay. Inventory APIs, overloads, options, node fields, and plugin hooks as supported, explicitly unsupported, or handled by an explicit compatibility path. If the required consumer still needs broad call-site rewrites, the migration gate has not passed. Prefer a whole-document compatibility choice at load time over switching between two mutable DOMs mid-transformation; include fallback costs in the benchmark.

## Feature set

The inventory below is derived from observed MDN/engine usage. Audit all production call sites and relevant tests before freezing the first supported subset.

| Area | Required or candidate first-version behavior |
|---|---|
| Parsing | Full HTML documents; contextual HTML fragments; inserted markup; configurable scripting behavior; input encoding handled explicitly |
| HTML semantics | Entities, raw script/style text, `noscript`, malformed markup recovery, table construction, templates, inline SVG/MathML and namespaces |
| Selection | CSS selector lists, combinators, attribute operators/flags, required pseudo-classes, escaped names such as `xlink:href`; compiled plan reuse |
| Collections | Stable snapshots; `.length`, indexing, `.eq()`, `.first()`, `.last()`, `.slice()`, `.get()`, `.toArray()`, iteration as required |
| Traversal | `.find()`, `.parent()`, `.children()`, `.contents()`, sibling traversal, `.is()` and required filtering |
| Attributes | Get/set/remove, bulk attributes, class operations, correct absence/empty/boolean behavior |
| Properties | The observed property subset, including tag-name reads and the engine's tag-renaming usage |
| Content | Text getter/setter, inner HTML getter/setter, document/fragment serialization |
| Mutation | Append/prepend, before/after, insert/append-to forms, remove, replace, clone, wrap, moving existing nodes |
| Callbacks | Required `.each()`, `.map()`, `.filter()` and function-valued forms, with documented observation and mutation order |
| Output | JavaScript strings where callers need them; owned bytes or safe byte views for saving |
| Lifecycle | Explicit document disposal; safe handles; cleanup on failure; single-threaded ownership |

Important migration details:

- Cheerio appears in the engine's public lifecycle types, not just its parser implementation. A replacement requires an API/type adapter.
- Plugins may expose or mutate raw domhandler fields. Inventory this separately; opaque handles cannot silently behave like unrestricted mutable JS node objects.
- First-element getter semantics, collection ordering/deduplication, clone/move behavior, and detached-node access need explicit tests.
- Retaining removed nodes through an existing selection is different from freeing their memory immediately.
- Preserve displayed example source while transforming only the intended live-example content.
- The core engine recursively processes `iframe[srcdoc]` and creates additional document/fragment contexts.
- Current URL hooks can read and mutate elements. Pre-extracting all attributes before hooks run can change later observations. Bulk extraction/update requires a compatible hook contract or an order-preserving fallback.

## XML and standalone SVG

HTML parsing with inline SVG support is not general XML parsing. The engine also processes sitemaps and standalone SVG, and exposes Cheerio parse/serialization options.

XML is a required part of the current implementation, including standalone SVG and sitemaps. Both bindings use a GroveDOM-owned iterative XML tokenizer feeding the existing document arenas. It supports qualified and case-sensitive names, entities, CDATA, declarations, fragment mutations and XML serialization. XML uses the same selection, buffering and disposal contracts as HTML; it adds no toolchain, runtime dependency or Cheerio fallback. See the [implemented XML contract](compatibility.md#xml-svg-and-sitemaps).

This is a Cheerio-style XML DOM, not a validating XML processor. Preserve declarations without fetching external resources or expanding DTD entities. Malformed-input recovery need not match htmlparser2 exactly. XML selector names are adapted in the bounded plan cache because Lexbor's normal name lookup folds case even for XML documents. Keep this work off the ordinary HTML query path, and measure XML against Cheerio's htmlparser2 XML mode, including bindings and disposal.

Repeated XML element/attribute creation reuses validated, interned names through a document-owned 64-entry cache, split equally between the two name kinds. Collisions replace entries and fall back to normal conversion; lowercase-option calls use that normal path. Cache entries borrow only immutable document-interned strings and IDs, never transient input or removed nodes. The existing document arena owns the fixed cache, so it adds no per-node backing allocation or separate cleanup scheme. Closing tags compare directly with the known parent name, and duplicate attributes compare their case-sensitive local IDs.

Attribute/text callbacks read and enqueue operations using the existing node handle without constructing an internal selection wrapper for every callback. Reads still flush earlier writes at the same boundary. A single-node read passes its integer ID directly to the binding; the kernel retains the same owner/disposal and node-ID bounds checks. Pending command views are reused only while their backing buffer and used range match, and are cleared on disposal. These are private transport optimizations, with unchanged command opcodes and no ABI compatibility promise.

## Kernel candidates

### Lexbor / C

An integrated HTML5 parser, DOM, selectors, and serializer. It is the leading C candidate, not a proven overall winner. Vendor a reviewed revision or release plus reviewed patches. See the concrete ABI and allocator findings in [research](research.md).

Compile only needed functionality where practical. Keep all Lexbor ownership behind the package boundary and use its supported lifecycle APIs. New mutation mechanisms or event-suppression flags must not change required behavior.

### html5ever / Rust

Use HTML5 parsing/serialization with an arena-backed DOM and selectors. Evaluate `dom_query` before building a custom tree. `html5ever` does not itself supply a DOM representation, so the tree and binding are part of the candidate being benchmarked.

Do not benchmark an allocation-heavy reference tree and conclude that all Rust stacks are slow. Do not attribute a custom fast parser's results to unmodified `html5ever`.

### Other options

- Go `net/html`/goquery: a credible HTML ecosystem, but lower initial priority for embedding into a Node downloader because it adds runtime/GC and bridge considerations.
- libxml2: mature XML/tree ecosystem; current HTML tree construction is not equivalent to HTML5 browser recovery.
- Expat: XML events; no HTML5 tree builder, mutable DOM, or serializer.
- Blink: useful correctness/performance reference, but deeply integrated with browser infrastructure.
- `lol_html`: potentially useful for a separate streaming-only path; insufficient for the arbitrary traversal and mutation workload.

## Bindings

Evaluate direct Wasm exports and ordinary Node-API bindings without assuming either always wins.

| Concern | Node-API | Wasm |
|---|---|---|
| Small scalar calls | Measure callback and argument-conversion costs | Measure direct-export call and argument-conversion costs |
| Existing Node input Buffer | Can borrow underlying bytes during a safe lifetime | Normally copied into linear memory unless already a view into it |
| Output bytes | Can expose an external Buffer with ownership/finalizer rules | Can expose a typed view of linear memory with lifetime/growth rules |
| UTF-8 to normal JS strings | Conversion/copy normally required | Decode/materialization normally required |
| Distribution | OS/architecture/libc binary matrix | Portable module subject to supported Wasm features/imports |

Zero-copy bytes do not imply zero-copy ordinary JavaScript strings. Native string creation and Wasm decoding both need measurement. Wasm string builtins or other adapters may change tradeoffs and must be benchmarked as part of the actual implementation.

A Node-API-to-Wasm compatibility layer such as emnapi is not equivalent to direct Wasm exports. Do not apply direct-call results to it without measuring.

## Memory ownership and allocation discipline

No leaks, accumulating allocator fragmentation, unnecessary allocations/copies, or avoidable small heap allocations in hot loops are acceptable. Use the selected kernel's existing arenas/pools where suitable before introducing allocator code. An arena label alone does not establish efficient memory use; audit its growth, reclamation, and mutation paths.

| Storage | Ownership and reuse |
|---|---|
| Nodes and attributes | Document-owned arenas or fixed-size pools; acquire backing blocks in chunks, then use bump/slot allocation inside parse/mutation loops. Keep node addresses/IDs stable. |
| Text and attribute values | Document-owned byte storage with capacity reuse. Reclaim/reuse superseded values when no references remain; do not append every attribute rewrite to an immortal string arena. Large values may use dedicated reclaimable blocks. |
| Commands, payloads, result slots | Reusable capacity buffers, reset after consumption; no object/array allocation per command. Grow in chunks outside inner loops where possible. |
| Query/traversal/serialization scratch | Reusable contiguous buffers or scoped bump arenas; reset after each operation/flush only when no surviving result borrows them. Nested callbacks need separate scratch scopes. |
| Selection snapshots | Store node IDs compactly. Queued operations and retained JS selections keep their snapshots valid; recycle storage after the last owner releases it. Do not recycle node IDs while handles survive. |
| Selector plans and interned names | Bounded caches with explicit ownership/eviction. Cache plans, not stale query memberships; never globally intern arbitrary page text/URLs. |
| JS nodes, strings, output | Materialize only at observations. Reuse node wrapper identity; strings and caller-owned arrays are unavoidable API allocations and must be counted. Owned output bytes are the default. |

Selection wrappers need coarse kernel-handle cleanup, not per-node cross-language reference counting. Release transient result slots after their last command use; release abandoned selection storage through wrapper cleanup at safe boundaries, and release all remaining storage on document disposal. Do not retain every temporary command result for the entire document lifetime. The document-level GC fallback below supplements explicit disposal; its timing is never required for correctness.

For repeated writes, reuse capacity and existing blocks rather than repeated general-purpose allocate/free calls. Chunked arenas and size-class reuse must bound external holes and internal slack; do not reserve worst-case buffers for every small document. Measure real allocation traces before adding custom pools or compaction. No moving compactor in the initial design: stable nodes, reclaimable value buffers, and bounded lifetimes keep the implementation understandable.

### Lifetime rules

- One document has a clear owner; handles retain or validate that owner.
- Detect disposed/foreign/stale handles. Do not expose raw pointers as the public API.
- Removed nodes remain usable through retained selections and observed node objects. Retaining detached nodes until document disposal is the initial simple policy; account for that capacity in long-lived mutation tests rather than calling it free memory.
- `dispose()` is idempotent and deterministically releases kernel-owned document storage, pending commands, document caches, and owner references at a safe call boundary. Later handle use fails safely. Construction, parse, mutation, serialization, and callback failures must have cleanup paths.
- Default output is a JS string or owned bytes that survive disposal. For native external Buffers, transfer the allocation to an owner with a finalizer; document disposal cannot free bytes the caller owns.
- Borrowed byte views are an optional measured optimization with a narrow explicit lifetime. They must not be the default Cheerio-compatible output. They cannot survive storage reuse/disposal or be held across callbacks/`await` without an ownership mechanism.
- Refresh Wasm views after any call that can grow memory, including a call for another document in a shared heap. Do not retain raw pointers/views across callbacks or asynchronous suspension.
- No shared mutable tree or cross-thread ownership in this iteration. A cross-document move must use an explicit clone/adoption path that establishes destination ownership; never splice pointers across document arenas. Inventory required Cheerio behavior here.
- Hide native helper symbols; export only the intended binding entry points.

Leak-free means no unreachable live allocations after owners are released; it does not mean a native allocator immediately returns all freed pages to the OS. Report live bytes separately from reserved capacity, free holes, and RSS. Wasm linear memory cannot currently shrink: freeing allocator blocks and releasing an entire instance are different operations.

The current diagnostics distinguish backing allocations from document control records and owned Wasm capacity. Empty result storage is reused within each binding environment; selection objects still retain independent snapshots and mutation state. Disposal clears the facade's backend owner reference as well as buffers and caches. See [memory measurements](memory.md) for the tested lifetime patterns and workload-specific budgets.

### Disposal decision: explicit ownership with a GC fallback

Keep **explicit, synchronous, idempotent `$.dispose()` as the primary API**, and provide best-effort cleanup for abandoned documents. `website-scrap-engine` can place disposal in `finally` around its complete DOM lifecycle, after the last hook or nested operation that needs that document. Serialization produces a string or owned bytes before disposal, so saving those bytes does not need to keep the DOM alive. An async lifecycle must await all DOM-using work before leaving that scope.

GC alone is unsuitable for the primary contract: a small JS wrapper can own a large native arena, finalizers have no promptness guarantee, and a shared Wasm heap cannot discover unreachable individual documents itself. Explicit disposal gives predictable reuse and bounds peak memory. GC fallback makes forgotten cleanup recoverable when collection runs, without forcing every incidental caller to implement ownership perfectly. It does not promise bounded memory for callers that never dispose.

| Backend | Explicit disposal | Abandoned-owner fallback |
|---|---|---|
| Node-API native | Destroy document allocations through a native cleanup routine; null the pointer in its small control record | Attach one `napi_wrap` finalizer to the document owner. It invokes the same cleanup if needed, then frees the control record. No additional JS `FinalizationRegistry` for this document. |
| Wasm, global instance/heap | Destroy that document's arenas and release its handle; unregister its cleanup token | One module-level `FinalizationRegistry` registers each document owner with an independent cleanup record. Its callback releases that document in the still-live shared backend. |
| Wasm, pooled instance | Destroy the document, then retain the empty instance only within idle count/byte caps | Registry fallback performs the same release; held records never retain the owner target. |
| Wasm, instance/heap per DOM | Destroy document state and clear the owner's references to instance/memory and views | Ordinary host GC reclaims the unreachable instance/memory ownership graph. No registry is needed when all resources live in that graph; add one only if actual host resources outside it require cleanup. |

Use one internal **owner object** shared by `$`, selections, observed node wrappers, and active operations. Register/wrap that owner, not just the callable `$`: dropping `$` while a selection remains reachable must not free the document. These objects keep the owner alive normally. Explicit disposal overrides those references and invalidates all handles immediately; retained wrappers then hold only a small disposed owner, not the native tree or per-document Wasm instance. Caller-owned output is independent.

Keep cleanup records independent of the registration target. `FinalizationRegistry` held values and its callback must not retain the owner, `$`, selections, or closures pointing back to them. Do not create a strong `napi_ref` or global owner list that prevents collection. A shared-Wasm cleanup record may retain the backend plus document handle, but never the JS owner. Backend/allocator state must outlive its outstanding cleanup records.

Use a single release-once state in each control record. Explicit release marks it closed, clears the resource pointer/handle, and unregisters Wasm fallback cleanup. A later native finalizer sees a closed record and only frees that small record. Do not register finalizers on every node or command to manage document lifetime. No finalizer may execute queued mutations, serialize output, call user hooks, or throw into user code. Native finalizers perform native cleanup and only accounting permitted by the supported Node-API; they do not call JavaScript or require experimental post-finalizer machinery.

`dispose()` discards pending commands; it does **not** flush work that will immediately be thrown away. It is a no-op after the first disposal and works after a failed flush. Public observations/mutations after disposal throw a consistent disposed-document error. Construction failure before ownership registration must free directly.

A caller can request disposal inside a callback. Mark the owner closed immediately, discard pending work, and defer physical freeing until the outermost active kernel call unwinds; that call must detect the closure after callback return and stop safely. Its `finally` path performs the release before returning to the caller. This is a synchronous reentry guard, not a background disposer, thread, or GC wait. Keep active owners strongly reachable throughout a call.

For native memory, report document-owned backing-block capacity with `napi_adjust_external_memory`, updating on chunk growth/release at safe boundaries rather than per node. Balance increases/decreases on explicit cleanup and finalization. Do not count bytes twice when output ownership transfers to a Buffer or when storage is already runtime-accounted. This helps the runtime notice native pressure; it does not guarantee a GC schedule. Wasm linear memory is host-managed and does not need a second invented external-memory counter through the native binding.

Primary performance and memory gates exercise explicit disposal. Separately test abandoned owners, retained selections after `$` is dropped, explicit disposal followed by collection, callback reentry, and environment teardown. Do not rely on finalizer order or delivery at process exit, or assert that a `FinalizationRegistry` callback runs within a fixed number of turns. Use deterministic tests for the release-once routine and diagnostic GC stress for fallback behavior.

### Wasm: shared, fresh, and pooled instances

Compare shared and fresh ownership below, plus the bounded pool described afterward, using the same kernel, facade, allocator policy where possible, and single-threaded replay:

| Concern | One instance/heap for all live DOMs | One instance/heap per DOM |
|---|---|---|
| Structure | One `WebAssembly.Instance` and memory with document-local arenas allocated within one global allocator | Reuse one compiled `WebAssembly.Module`; each document gets its own instance, memory, allocator, globals, and arenas |
| Setup cost | Instantiate once; document creation mainly creates its arena/state | Instantiate and initialize for every document, including nested documents |
| Baseline capacity | Runtime/static/stack space shared; freed blocks can serve another document | Runtime/static/stack and minimum memory capacity repeated for each live document; compiled module is reused |
| Disposal and high-water mark | Free document blocks for reuse; linear memory stays at its largest size until the whole instance is dropped | Free document resources and drop references to its instance/memory; host GC controls when backing memory is actually reclaimed |
| Fragmentation | Interleaved document sizes/lifetimes may leave holes in the global allocator despite document arenas | Holes are contained within each document heap; page rounding and per-instance slack can be large for small DOMs |
| Growth and views | Growth for any DOM invalidates cached unshared-memory views for every DOM | Growth invalidates that document's views only |
| Failure scope | Trap/allocator damage may affect all DOMs; document-ID checks are essential | Trap and heap ownership are isolated to that instance; host-wide OOM is still possible |
| Cross-document work | Handles still need ownership checks; shared address space does not permit unsafe arena splicing | Data must be copied/cloned across memories according to the API contract |

Start the first Wasm diagnostic with one shared instance per calling environment and document arenas because it needs fewer instances and reuses capacity. This is a prototype starting point, not the production decision. Compare it with fresh per-document instances before selecting the memory model. Also compare a bounded idle pool: one document owns each checked-out instance, and disposal/finalizer cleanup returns an empty instance when it fits the count/byte caps. Drop oversized or excess instances. No worker threads, memory sharing between instances, or custom scheduler. The prototype defaults to four idle instances and 16 MiB total idle capacity.

Measure sequential documents, multiple live documents interleaved on one thread, nested documents, varied disposal order, repeated edits, and a huge document followed by many small ones. Count instantiation in per-document lifetime cost even when module compilation is warm. Track linear-memory pages, allocator live/reserved/free bytes, fragmentation/slack, JS heap, RSS, and time to release backing memory after references disappear. Retained handles must become lightweight disposed wrappers, rather than accidentally retaining an entire per-document instance. Compare optional shared-instance reset only at a boundary with no live documents or borrowed views.

Measure initial-size choices on unmodified representative pages. Add an HTML-size heuristic only if linear-memory growth materially dominates total lifetime overhead; include any work shifted into instance creation and resulting retained capacity. The current MDN diagnostic does not support such a heuristic.

The current prototype starts with 1 MiB linear memory, including a 32 KiB stack and a 16 KiB fixed transfer scratch area per instance. The [recursion audit](stack.md) covers the facade, kernel, reachable Lexbor code and linked libc. Expanded stack-pointer instrumentation reaches 6,256 bytes in two compiler configurations, leaving about 5.2× observed headroom. Repeat the audit when changing compiler options, dependencies or kernel paths. These measurements exclude the engine's separate call stack and are not a worst-case bound. Halving the former stack reservation releases allocator headroom within the same initial memory.

The fixed scratch area carries opcodes, payloads, and node IDs only during synchronous kernel calls. All DOMs within an instance can reuse it because the kernel never calls back into user JS. Oversized transfers use the existing document-owned growable buffer. Pending mutation queues remain document-owned: sharing their storage would otherwise require extra copies or flushing another document's work early. Scratch pointers never escape as public results, and JS views must refresh after memory growth.

Choose using complete workload time, peak/retained memory, and code complexity. A shared heap that retains unacceptable high-water capacity or cannot reuse free blocks fails the memory gate; separate heaps that lose the speed gate or waste excessive per-document capacity fail too. Neither model is presumed faster or memory-safe without measurement.

## Optimization sequence and non-goals

Start with bounded selector-plan caching, name interning, whole-selection operations, compact storage, and bulk transfer. Add fusion only for a measured bottleneck and a small rule that preserves issue order; do not grow a general optimizer.

Keep the Wasm kernel compute-only. Release artifacts require no host imports; diagnostic builds may import explicit clock/counter hooks. Avoid pulling general stdio into error formatting, and fail the build if a new I/O import appears. Additional Wasm target features are build-time experiments applied consistently to the core and dependency; retain the simplest default unless complete-workload measurements show a repeatable gain.

Enabling SIMD permits compiler vectorization; it does not establish that hot loops use useful vector operations. Inspect emitted instructions and measure the full operation, including transfers and lifecycle. Keep any handwritten Wasm intrinsics in GroveDOM-owned code with a scalar path, bounded memory accesses, and a separately measured benefit. Do not fork or patch Lexbor for SIMD, or interpret an inconclusive automatic-vectorization result as evidence against explicit intrinsics.

Initial non-goals: a browser engine, layout, executing page scripts, full jQuery compatibility, internal parallel execution, library-managed worker pools, an out-of-order scheduler, transaction rollback, a stable internal ABI, or a JIT. Supporting independent documents in caller-managed workers is within scope.

JIT research remains deferred. It does not eliminate JS observations or string conversion and is not part of the implementation or toolchain proposed here.
