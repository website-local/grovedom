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
| `src/facade/selection.js` | Cheerio-shaped collection methods and private branding |
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
- Each document belongs to its creating environment. Caller-managed workers can
  own independent documents; GroveDOM creates no threads or shared-document API.
- Kernel calls never invoke user JS. Shared transfer scratch is borrowed only
  during a synchronous call. Returned strings and arrays own their data.
- Disposal discards pending commands and invalidates retained handles. GC cleanup
  is a fallback, not a promptness guarantee.
- Wasm instances use non-shared memory. Growth detaches old views; bindings refresh
  them before access. Pooled instances are reused only after document cleanup.

See [compatibility](compatibility.md), [memory](memory.md) and the
[historical design rationale](history/design.md) for scope and tradeoffs.
