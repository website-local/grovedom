# Research and decision record

Dependency research reviewed in October 2026. These observations describe the cited revisions, not a guarantee about future releases. No complete GroveDOM performance result has been established.

An initial [native prototype](prototype.md) now builds the reviewed Lexbor revision, checks its source fingerprint, and exercises a partial facade with authored differential and lifecycle tests. This is implementation evidence for a candidate, not a kernel/binding selection or the full performance gate. Direct Wasm with shared/fresh/pooled instances is now measured diagnostically; Rust and the production decision remain open.

## Decisions and remaining choices

| Topic | State |
|---|---|
| Primary speed requirement | Agreed: ≥3× complete DOM workload against current Cheerio, including bindings |
| Optimized JS baseline | Required win over the best compatible Cheerio/parse5 and Cheerio/htmlparser2 configurations |
| Execution model | Agreed: per-document ordered buffered operations and flush, not out-of-order execution |
| Implementation complexity | Small facade and dispatcher over existing kernel facilities; choose one initial production backend after scoped comparisons |
| Threading | Synchronous calls from main or caller-managed worker threads, with independent documents; no internal threads, shared-document execution, or parallel scheduler |
| Toolchain | Node scripts and the selected compiler/build tools; Python only for an unavoidable dependency |
| Memory | Document arenas/pools, reused buffers, bounded caches; verify leaks, fragmentation, retained capacity, and hot-loop allocations |
| Disposal | Explicit idempotent disposal at the engine lifecycle boundary, plus backend-appropriate GC fallback; finalizer timing is never the primary lifecycle contract |
| Minimum Node.js | Decided: >=22.0.0; maintained Node 22/24 validation initially, no Node 18/20 support |
| Wasm heap ownership | Compare shared, fresh per-document, and bounded pooled instances, reusing the compiled module |
| Internal protocol | Small private opcodes/operands/payloads; no version/checksum/negotiation or stable ABI promise; glue and kernel ship on the same major.minor version |
| JIT | Deferred; not needed for initial implementation |
| Package boundary | Separate DOM package; downloader policies stay in engine |
| Kernel language/library | Open: Lexbor/C and html5ever with an arena DOM/Rust are primary candidates |
| Node-API versus Wasm | Open: call shape and data transfer matter; neither is a universal winner |
| Cheerio migration and typedefs | Cheerio-shaped API and straightforward migration required; reuse truthful public typedefs; exact methods/options/raw-node behavior still need an inventory |
| License and publication | License and release packaging remain undecided; no package released |

Published parser results do not establish a universal kernel ranking. Binding choice also depends on call shape, string conversion, allocation, and lifecycle costs; measure the complete facade before selecting a backend.

## Boundary costs to measure

Compare ordinary Node-API calls with direct Wasm exports using the same kernel work and observable results. Include scalar calls, string input/output, selection transfer, and complete document lifecycles. A small-call result cannot predict full DOM performance or the cost of an emulated Node-API layer over Wasm.

Native string creation through `napi_create_string_utf8` copies/converts data. A direct Wasm path generally uses pointer/length descriptors, `TextDecoder`, and input encoding into linear memory. Reusing input buffers avoids some temporary allocations, but both paths must account for output materialization, non-ASCII text, and real callback needs.

Keep native helper symbols hidden and export only binding entry points. Generic exported helper names can collide with process or runtime symbols. This discipline applies independently of the chosen allocator or DOM kernel.

## Published parser comparisons

All figures in this section are upstream-reported; they are not GroveDOM measurements. Refer to the source benchmark methodology when comparing them.

- [Nokolexbor](https://github.com/serpapi/nokolexbor#benchmarks): a 367 KB Google results document, 994.8 parses/sec versus Nokogiri/libxml2's 211.8: 4.70×. This includes Ruby bindings and excludes full mutation/serialization. Very large advertised selector ratios compare different execution strategies and are not general parser speedups.
- [FastHTML](https://github.com/DefactoSoftware/fast_html#benchmarks): Lexbor wrapper versus html5ever wrapper reports 125.12 versus 395.21 ms on 6.9 MB, 0.50 versus 1.72 ms on 25 KB, and 44.60 versus 43.58 microseconds on a 757-byte fragment. This is an older Elixir comparison with different integration mechanisms and tree conversion, not a current raw-kernel ranking.
- [Rustysoup](https://github.com/joaonevess/rustysoup): reports 65.47 versus 168.72 ms against Selectolax/Lexbor over 104 pages/19.83 MiB. At inspected revision `ab39d718bfc68d225226a64fdbd685550ee8c61f`, source contains custom fast full-document/fragment parsers ahead of html5ever and BeautifulSoup-oriented normalization. Do not attribute that result to equivalent unmodified html5ever parsing.
- [Lexbor design article](https://lexbor.com/articles/part-1-html/): describes the parser architecture and historical parsing throughput. Those results are not a prediction for GroveDOM or the MDN workload.

No credible current head-to-head measurement was established for Lexbor versus Blink including parsing, mutation, and serialization. Chromium has optimized fragment paths and SIMD-assisted scanning. Benchmark detached DOM work, not browser startup/network/layout, when comparing parser behavior. Extracting Blink as a small standalone library is a separate engineering problem.

`html5ever` is Servo's parser, not Firefox's or Chromium's. It delegates DOM representation through TreeSink. A selector/query benchmark must identify the tree and selector implementation.

Expat is a streaming XML parser without the required HTML5 tree construction, DOM, and serializer. Current [libxml2 HTML source](https://github.com/GNOME/libxml2/blob/master/HTMLparser.c) says tokenization conforms to HTML5 while tree construction remains custom/nonstandard.

## Lexbor maintenance assessment

Inspected main revision: `f4cbbcd91359a0ec9499e3ce7e263de629482d61` (2026-09-28).

Lexbor is production-credible but requires dependency ownership. Created in 2018; active in September 2026. GitHub's inspected contributor list showed 816 contributions by the primary author, followed by 20, 17, and smaller counts from others. This indicates concentration, not a sole-contributor project. Counts do not establish a support guarantee.

Evidence in its favor includes PHP 8.4 adoption, Selectolax/Nokolexbor use, conformance tests, mutation/serialization tests, fuzz harnesses, and a private security-reporting policy. PHP's [8.4 HTML implementation](https://github.com/php/php-src/blob/PHP-8.4/ext/dom/html_document.c) converts Lexbor's parsed document into libxml2 structures; adoption therefore does not validate every Lexbor mutation/serialization path we might expose.

Concrete findings:

- [v3.0.0](https://github.com/lexbor/lexbor/releases/tag/v3.0.0), released 2026-03-31, corrected an accidental ABI break in v2.7.0. Node-API ABI stability does not fix ABI changes in an independently linked kernel library.
- [2026-09-23 allocator fix](https://github.com/lexbor/lexbor/commit/f3f6fa71e0de98dcfe8df572cb8a0ba8c84b2411) corrected memory corruption when shrinking certain non-tail allocations.
- [2026-09-28 array fix](https://github.com/lexbor/lexbor/commit/f4cbbcd91359a0ec9499e3ce7e263de629482d61) corrected 8× over-allocation in one array structure on 64-bit systems and an incorrect move size. This is not an 8× total-memory claim.
- Both corrected code patterns were verified present in the v3.0.0 source. Do not select unpatched v3.0.0 just because it was the latest release when inspected.
- Visible main CI was Linux-based. Fuzz harnesses exist; continuous OSS-Fuzz coverage was not established. Do not claim a full independent security audit.

Keep the kernel replaceable, pin reviewed source, monitor fixes, and exercise the exact mutation/lifetime paths used by the binding. No claim was made that these bugs are reachable through a completed GroveDOM implementation, which does not exist yet.

Replaceability here means keeping Lexbor details behind a small internal boundary, not promising a stable ABI or dynamically interchangeable kernels. Prefer building reviewed source into the artifact shipped with matching JS glue. The recorded upstream ABI fixes still matter when selecting source, even though GroveDOM does not promise an internal ABI across releases.

## Rust candidate

`dom_query` revision inspected: `6b04c459d19eee8af62d4bd5799e2a1dae372553`, package version 0.28.0. It uses html5ever 0.39.0 and selectors 0.40.0, with an arena tree and mutation API. Audit its actual defaults and lifetime model before adopting it.

In particular, its convenience parser disables scripting while Cheerio/parse5 defaults to scripting enabled. A benchmark must align options, especially for `noscript`. An arena-backed Rust stack remains a candidate, not a measured winner.

## Minimal toolchains and cross-compilation

Design constraint: keep only the tools required for the chosen production backend. Use Node scripts for orchestration and reporting; do not introduce Python for convenience. node-gyp/Emscripten and extra binding generators are not defaults. If a necessary dependency requires Python and no reasonable simpler route exists, record that exception explicitly. Candidate comparisons do not commit the package to shipping both C and Rust toolchains or both bindings.

- Native Node-API is a C ABI. A C compiler/linker, target runtime development files, and Node-API headers are sufficient ingredients; node-gyp, Python, Rust, and rebuilding Node/V8 are not inherent requirements.
- CMake can orchestrate Lexbor builds but is a convenience/build-system choice. Keep helper symbols hidden and use correct platform shared-library flags.
- Wasm can use Clang with Wasm support, wasm-ld, a suitable sysroot/libc, and required compiler-runtime builtins. Emscripten is optional. Freestanding code needing no libc can omit WASI; a real DOM kernel must provide its allocation and library dependencies.
- A real WASI build needs its imported functions supplied by the host. Do not equate a bare module and a full WASI command/reactor without checking initialization and imports.
- [WASI SDK](https://github.com/WebAssembly/wasi-sdk#about-this-repository) documents standard Clang plus a sysroot/builtins; it is a convenient distribution, not the only compiler route.
- MSVC is conventional, not mandatory for Windows Node-API. [LLVM-MinGW](https://github.com/mstorsjo/llvm-mingw#releases) supplies Linux-hosted Windows cross-compilers; MinGW-w64 is also viable.
- Windows needs a compatible import library for Node's exports or runtime symbol resolution, correct target ABI, and runtime dependency handling. Keep allocation/free ownership within the appropriate component. Validate on actual Windows Node.
- Node-API versioning reduces per-Node-major rebuilds but does not remove OS/architecture/libc packaging differences.
- Rust/napi-rs avoids node-gyp. Wrapping Lexbor in Rust still needs both Rust and C build support; a Rust wrapper does not make the underlying C memory-safe.

### Prototype prerequisites

| Work | Required tools and checks |
|---|---|
| API inventory and baseline | Supported Node.js, a package manager, TypeScript for compatibility checks, and pinned consumer dependencies |
| C/native | A C compiler/linker, target runtime headers/libraries, Node-API headers, and the selected kernel's build requirements |
| C/Wasm | Clang/wasm-ld and a matching sysroot/libc/compiler runtime, or a prebuilt WASI SDK; inspect actual imports and initialization |
| Rust/native | Rust/Cargo compatible with the selected dependency graph and the target linker |
| Rust/Wasm | A coherent Rust toolchain with the matching Wasm target standard library; verify any host imports |
| Memory diagnostics | Native sanitizer support plus allocator, lifetime, and bounds checks on actual Wasm paths |

For C/Wasm, a scalar freestanding module is insufficient validation: compile and run an allocator-using fixture before building the DOM kernel. For Rust/Wasm, a target name appearing in a compiler's supported-target list does not mean its standard library is installed. Resolve and lock the real dependency graph before asserting compiler compatibility.

Run small compile/load checks on supported Node lines and target platforms before starting performance trials. Windows outputs need validation on Windows even when cross-compiled. Keep developer installation inventories and raw diagnostics out of public documentation.

## Wasm memory comparison

The [design](design.md#wasm-shared-fresh-and-pooled-instances) compares one instance/global allocator containing document-local arenas, a fresh instance/memory per document, and a bounded pool of reusable instances. All reuse a compiled module; none uses threads or shared mutable memory between instances. The [prototype measurements](benchmarks.md#wasm-heap-and-profile-diagnostics) cover these policies diagnostically.

WebAssembly linear memory grows in pages and has no shrink operation. Returning blocks to a global allocator enables reuse without reducing its linear-memory size. Dropping a per-document instance can make its backing memory reclaimable only after all references disappear; host GC controls actual reclamation. Reusing a compiled module avoids repeated compilation, not per-instance memory, initialization, or static/stack costs. External JS views can retain an otherwise disposed instance's memory. These lifecycle costs belong in the full workload comparison, not only a startup footnote.

No production heap policy has been selected. Global and pooled instances avoid repeated initialization in the current diagnostics, but representative memory budgets and mixed-size fragmentation measurements remain necessary.

## Disposal and Node.js support decision

The lifecycle contract is **explicit disposal with a GC fallback, on Node >=22.0.0**. `website-scrap-engine` owns disposal in `finally`; generic callers also get abandoned-owner cleanup. See the [lifetime design](design.md#disposal-decision-explicit-ownership-with-a-gc-fallback) for ownership and release-once rules.

Use `napi_wrap` for a native document-owner finalizer. Use `FinalizationRegistry` for abandoned individual documents inside a global Wasm heap. An isolated per-document Wasm instance with no outside resources can rely on ordinary host GC when its ownership graph becomes unreachable, avoiding a redundant finalization registry. A retained selection must retain the owner in every backend; a registry's held value must not retain that owner.

Reviewed the official [Node-API documentation](https://nodejs.org/api/n-api.html#napi_wrap): `napi_wrap` supports a native cleanup callback, and its optional returned reference is initially weak. Finalizers may be deferred. A tiny closed control record prevents explicit disposal followed by finalization from releasing the document twice. Do not create unnecessary strong native references back to the owner.

The [external memory accounting API](https://nodejs.org/api/n-api.html#napi_adjust_external_memory) informs the runtime about addon-owned memory, but is not a guarantee of prompt GC. Account at backing-block boundaries and balance release paths. The [finalizer restrictions](https://nodejs.org/api/n-api.html#node_api_basic_finalize) explain why cleanup must avoid arbitrary JS/Node-API calls during GC. Use stable APIs supported at the package floor; newer or experimental post-finalizer machinery is unnecessary for native-only DOM cleanup.

The official [Node release schedule](https://github.com/nodejs/Release/blob/main/schedule.json), checked for this update, lists:

| Node line | End of life | Decision as of 2026-10-02 |
|---|---|---|
| 18 | 2025-04-30 | Exclude; already unsupported upstream |
| 20 | 2026-04-30 | Exclude; already unsupported upstream |
| 22 | 2027-04-30 | Minimum supported line; use patched releases in normal operation |
| 24 | 2028-04-30 | Also validate; longer support runway |

Cheerio 1.2.0 declares Node >=20.18.1, so Node 18 is also outside the current baseline's supported engines. FinalizationRegistry and basic Node-API finalizers existed before Node 22: the chosen minimum simplifies the support matrix rather than enabling an otherwise unavailable GC feature. The prototype now tests explicit disposal, retained handles, callback disposal, GC fallback, and worker teardown; full consumer lifecycle coverage remains open.

## Cheerio declaration inspection

The compatibility review uses Cheerio 1.2.0 and domhandler 5.0.3 declarations: Cheerio's public exports and `dist/esm/{cheerio,load,types,options}.d.ts`, plus domhandler's `lib/node.d.ts`. These package declarations describe the surface an adapter must satisfy; they do not prove runtime compatibility.

- Cheerio supplies `Cheerio<T>`, `CheerioAPI`, `CheerioOptions`, `HTMLParser2Options`, and helper types such as `SelectorType`/`FilterFunction<T>` through its public entry point; no separate `@types/cheerio` is needed.
- `Cheerio<T>` includes numeric indexing, iteration, internal-looking fields/methods, and methods whose return and `this` types refer back to Cheerio. Selecting a few properties does not automatically yield an independent, correctly typed GroveDOM collection.
- `CheerioAPI` is callable and has generic selector/node overloads plus static helpers and plugin surface. Its declaration is not just a selector function returning opaque IDs.
- Node inputs and outputs use domhandler's `AnyNode`/`Element` contracts, including mutable parents/siblings/children, names, attribute maps, and node methods. Reusing these types requires compatible wrappers or an explicit narrower surface.
- `CheerioOptions` includes parse5 and selector extension points; blindly aliasing it would promise unsupported parser-specific behavior.

The prototype uses public type-only imports/re-exports and local declarations for its narrower handles and supported methods. Representative declaration fixtures and 87 audited consumer TypeScript source files now compile. The isolated engine/MDN replay also passes; complete engine lifecycle integration and unaudited plugin surfaces remain outside that evidence. See [integration](integration.md).

## XML and template implementation findings

The current XML path is GroveDOM-owned iterative tokenization into the pinned Lexbor document arenas, shared by native and Wasm. It is compiled as `native/xml.c` with a private `xml.h`; allocator/buffer helpers shared with `kernel.c` remain hidden implementation symbols. This avoids adding another parser dependency or syscall-bearing runtime. It is a practical Cheerio-compatible DOM contract, not a validating XML implementation; see [the supported behavior](compatibility.md#xml-svg-and-sitemaps).

Several details in the pinned Lexbor source require explicit handling without patching the dependency:

- XML dtype does not disable lowercasing in element creation, type-selector lookup or attribute-selector lookup. GroveDOM preserves static lowercase IDs, and maps other local names to an impossible XML name containing lowercase hex. Qualified names keep the public spelling. The cached selector AST receives the same mapping, including nested lists. A reusable document buffer serves name conversion; unique names and plans use the existing arenas.
- `lxb_dom_element_qualified_name_set` is exported by the pinned source but omitted from its header. GroveDOM declares its exact signature locally. This is a private dependency coupling, not a public ABI promise.
- The document CDATA helper rejects XML dtype. Direct CDATA interface construction supplies the Cheerio-style wrapper with a text child. Its clone uses the matching interface; the generic clone would allocate only a node-sized record.
- Generic element cloning omits the qualified-name field. The XML clone callback copies this interned field within the same document; cross-document adoption remains unsupported.
- Lexbor's XML `:root` resolves to the first document child, which can be a declaration. GroveDOM maps this pseudo to `:not(* > *)` in the XML plan arena, matching elements without an element parent, including multiple fragment roots.
- Specialized HTML destructors omit common element attribute destruction. The shared subtree recycler explicitly returns attributes before destroying interfaces. Repeated attribute-bearing replacement now plateaus after warmup, including template and XML cases; exposed subtrees remain retained until disposal.

Parser, serializer and subtree cleanup walks are iterative. The XML additions preserve import-free release Wasm and the existing stack/heap defaults. Sanitizers, deep-tree tests and backing-allocation counters provide evidence for the exercised paths; allocation-failure injection, fuzzing and sustained allocator-fragmentation budgets remain open.

## Consumer replay and selector findings

The engine/MDN audit after `d29bb5f` found nested document loads but no required cross-document node transfer. The isolated adapter owns these loads through serialization and disposes in `finally`; original consumer repositories remain untouched. See [integration](integration.md) for frozen revisions, replay boundaries and reproduction.

Lexbor's `:lexbor-contains` examines direct text children; simply renaming Cheerio's `:contains` would miss text spanning descendants. Its `:empty` counts a fragment child, and forward `:has` traversal skips fragment subtrees. GroveDOM keeps an owned compatibility evaluator in standard C/header files, reusing parsed/cached selector ASTs and Lexbor's ordinary atom matcher. Text matching uses one reusable document buffer, including Cheerio's `br` newline and template-fragment behavior. Selector recursion is capped at 64; tree walks are iterative. This adds no Lexbor patches, custom parser dependency or per-node JavaScript callbacks.

Profiling real MDN transforms identified template-query evaluator restarts as the main avoidable kernel cost. Ordinary selectors now run once per fragment-free subtree. A preorder walk marks/emits matches through existing node records and result storage, preserving order and deduplication without sorting or temporary node arrays. Element-only query scopes stop at fragments, while global and fragment-root queries can cross them. Parent links are disconnected only around synchronous selector execution and restored before returning, including failures. The custom pseudo evaluator is used only for plans that need it.

The form audit preserves Cheerio 1.2.0's actual successful behavior: disabled fieldsets do not exclude their descendant controls from `serializeArray`, and selected options in multiple selects contribute text. URL properties resolve against `baseURI` only for Cheerio's supported element/property pairs. Browser form semantics are not substituted for the migration baseline.

The root Cheerio entry's private `_useHtmlParser2` flag alone is an unsuitable benchmark configuration: static serialization can lose it. Use `cheerio/slim` or the supported `xml: { xmlMode: false }` configuration. On the saved larger MDN pages, normalized output and resource events match parse5; generated-example and fragment cases still differ. A comparison must distinguish byte spelling from structural or discovery differences.
