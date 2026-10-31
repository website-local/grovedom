# Architecture

GroveDOM keeps the application-independent DOM API separate from downloader
resource policy, host loading, transport, and the DOM kernel. Wasm on Node is the
primary target; native and browser entries instantiate independent facades.

## ESM modules

| Module | Responsibility |
|---|---|
| `src/index.js` | Node/Wasm initialization and public functions |
| `src/browser.js` | Async fetch/compile, then synchronous public functions |
| `src/native.js` | Independent Node-API package initialization |
| `src/initialize.js` | Initialization option validation |
| `src/build-config.js` | Constants replaced by the selected build during packaging |
| `src/facade/document.js` | Document ownership, callable `$`, selections and disposal |
| `src/facade/selection.js` | Cheerio-shaped collection methods and selection snapshots |
| `src/facade/nodes.js` | Stable wrappers, raw node properties, XML callbacks |
| `src/facade/operations.js` | Buffered commands, flush/read boundaries and queries |
| `src/facade/collection-helpers.js` | Mapping, classes, insertion and wrapping helpers |
| `src/facade/data.js`, `style.js` | Per-key data caching and inline style parsing |
| `src/facade/options.js` | Parser/serializer option translation |
| `src/wasm/kernel.js` | Portable Wasm transport and instance lifecycle |
| `src/wasm/node.js`, `browser.js` | Host-specific byte loading/decoding |
| `diagnostics/` | Statistics, profiling and developer environment configuration |

Factories bind helpers once per package entry, not per document. Node and browser
share algorithms; Node retains direct Buffer decoding. The browser graph imports
no Node modules or globals. Release entries never import diagnostics. No runtime
package/build JSON checks or environment-variable configuration remain.

## Internal JavaScript state

Use direct properties for library-owned state, including `Selection`,
`NodeHandle` and future classes. Their `_state` records and other undocumented
fields are explicitly unsupported: names, layouts, mutability and enumeration
have **no compatibility promise, even between patch releases**. They are not
included in the public declarations. Applications must not mutate them.

Do not add private fields, WeakMap records or accessor methods merely to hide
state. Any exception needs a visible, measured performance improvement on the
relevant workload. The shipped JavaScript has no private fields or WeakMaps.
Developer timing instrumentation separately tracks caller-owned functions and
prototypes weakly, without modifying or retaining those external objects.

Read known handle records directly. Reuse IDs, lengths and node wrappers already
available at a call site; preserve observations that can change across callbacks,
getters, coercion or mutation. Lifetime checks belong at boundaries that need
them, rather than at every helper in a synchronous call chain. In particular,
`wrap` requires a validated live document: reads/traversals validate before
wrapping, while callbacks and iterators recheck when user code can have disposed
the document. Cached attribute observations remain valid only until a write or
disposal clears the snapshot.

The nullable document owner is also the liveness marker. Resource fields start
null and receive their live values before use, so V8 learns that disposal can
change them. Disposal releases queue buffers; it need not rewrite unused queue
lengths and invalidate optimized reads on other documents. Numeric selection
Proxies return `_state` directly and skip index parsing for ordinary method
names. Other property reads preserve their receiver.

## Native C layout

`kernel.h` defines the private binding contract and opaque document type.
`document.h` owns internal document layout; `internal.h` joins private headers.

| Translation unit | Responsibility |
|---|---|
| `kernel.c` | Document creation, parsing, input/transfer buffers and disposal |
| `memory.c` / `.h` | Thread-local allocator accounting and reusable buffers |
| `nodes.c` / `.h` | Node IDs, snapshots, traversal and subtree lifetime |
| `query.c` / `.h` | Selector plans, matching and template traversal |
| `selectors.c` / `.h` | Selector guards and compatibility matching |
| `selector-values.c` / `.h` | ASCII token matching and isolated Unicode selector comparisons |
| `html-select.c` / `.h` | Cheerio/parse5 select insertion modes reached through pinned hooks |
| `serialize.c` / `.h` | Text, HTML serialization and observations |
| `attributes.c` / `.h` | Attribute names, foreign-namespace compatibility and mutation metadata |
| `mutate.c` / `.h` | Fragment edits and ordered mutation dispatch |
| `xml.c` / `.h` | Iterative XML parsing, names and serialization |
| `addon.c` | Thin Node-API binding |
| `wasm-memory.c` | Small Wasm memory helpers |
| `profile.c` / `.h`, `wasm-growth.c` | Macro-guarded native diagnostics |

Lexbor remains pinned, with [reviewed patches](../native/patches/README.md) applied
to verified build-local source copies. ThinLTO permits cross-file optimization.
Helpers stay hidden; the binary operation protocol is private and ships with its
matching JS. There is no protocol version negotiation or plugin framework.

## Invariants

- One ordered queue per document. Reads execute preceding writes; callbacks see
  mutations in issue order. Errors preserve earlier effects, not transactions.
- Selections snapshot IDs. Wrappers preserve node identity; retained detached
  nodes remain valid until explicit disposal.
- The parser instance, document, selections and node handles stay in the thread
  that parsed the input. Caller-managed workers own independent documents and
  exchange markup or extracted values. GroveDOM creates no threads or
  shared-document API; cloning or posting handles to another worker is unsupported.
- Kernel calls never invoke user JS. Shared transfer scratch is borrowed only
  during a synchronous call. Returned strings and arrays own their data.
- Disposal discards pending commands and invalidates retained handles. GC cleanup
  is a fallback, not a promptness guarantee.
- Loading snapshots options and finishes JavaScript construction before creating
  the kernel owner. Getter or construction failures cannot strand a document.
- Raw first/last-child reads register only the requested child ID. Reading one
  edge does not expose every sibling or keep replaced siblings alive.
- First-element getters transfer only the first ID; aggregate text, serialization
  and containment keep their required operands. Raw child enumeration wraps the
  traversal result directly into a fresh array without intermediate selections.
- Static `until` traversals test stop conditions in the kernel without exposing
  stop-node handles. Callback traversals follow live relations after tree edits;
  returned selections still retain snapshot membership and identity.
- Live attribute enumeration retains one internal map per document. Writes clear
  it before observation, and disposal releases it. Missing keys use ordinary
  attribute lookup; returned attribute snapshots remain independent.
- Scalar containment does not register ancestor handles. Node ID arrays are lazy;
  immediate callbacks borrow a document array and reacquire it after user code.
- Wasm instances use non-shared memory. Growth detaches old views; bindings refresh
  them before access. Pooled instances are reused only after document cleanup.

See [compatibility](compatibility.md), [memory](memory.md) and the
[historical design rationale](history/design.md) for scope and tradeoffs.
