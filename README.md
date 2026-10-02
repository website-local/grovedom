# GroveDOM

DOM transformations through ordered operations.

GroveDOM is a proposed JavaScript-facing HTML DOM package for workloads with many queries and mutations. Its initial integration target is `website-scrap-engine`, using MDN offline transformations as a representative workload.

**Status: design and research only. No DOM implementation or proven speedup exists yet.**

## Objective

Replace the required Cheerio workload with an implementation that preserves required behavior and takes **at most one third of the elapsed time** of the current Cheerio implementation, including parsing, queries, mutations, JavaScript/kernel transfers, serialization, and lifecycle costs.

GroveDOM must also be faster than the best behaviorally acceptable Cheerio configuration using **either `parse5` or `htmlparser2`**. Both are mandatory baselines, including their practical optimizations. The existing 3× target remains relative to current Cheerio; the additional gate is a demonstrated win over the fastest compatible configuration, not a new 3× multiplier over htmlparser2.

## Agreed direction

- A separate DOM package with an application-independent API and downloader-specific integration kept in `website-scrap-engine`.
- One ordered operation stream per document. Flush when JavaScript needs pending results, before supported callback observations, explicitly, and before final output.
- Selections, intermediate strings, and mutations stay in the kernel where possible.
- Keep implementation and build tooling simple. Use Node scripts and the selected kernel's compiler/build tools; introduce Python only if an unavoidable dependency requires it.
- Single-threaded execution initially: no worker pool, threads, shared-memory execution, out-of-order scheduler, speculation, or JIT.
- Use document-owned arenas/pools, reusable command and scratch buffers, and bounded caches. Avoid unnecessary copies, per-node temporary objects, and small heap allocations inside hot loops; verify leaks, fragmentation, and memory retained after disposal.
- Kernel and binding choices remain open until measured. Compare Lexbor/C and an arena-backed `html5ever`/Rust stack; compare direct Wasm exports and ordinary Node-API bindings.
- For Wasm, compare one instance/heap serving all documents with a separate instance/heap per document, reusing the compiled module in both cases.
- Keep the private operation protocol small: opcodes, operands, payloads, and results. No protocol version, checksum, negotiation, or stable internal ABI promise. JS glue and its Node-API or Wasm kernel ship together on the same major/minor version.
- Expose Cheerio-style `load`, callable `$`, chainable selections, callbacks, and node access so supported migrations need only an import change plus explicit lifecycle cleanup. Reuse Cheerio typedefs where they accurately describe runtime behavior; inventory remaining APIs and raw-node compatibility explicitly.
- Use explicit, idempotent `$.dispose()` as the primary lifecycle contract, owned by `website-scrap-engine` in `finally`. Add GC cleanup as a fallback: a Node-API owner finalizer for native, `FinalizationRegistry` for a shared Wasm heap, and ordinary host GC for an independently owned per-document Wasm instance.
- Minimum Node.js version: **22.0.0**. Validate maintained Node 22 and 24 releases initially; use stable runtime APIs and prebuilt artifacts. Node 18 and 20 are outside the supported range.

## Read next

1. [Design and feature set](docs/design.md)
2. [Benchmark targets and adoption gates](docs/benchmarks.md)
3. [Evidence, toolchains, and maintenance findings](docs/research.md)
4. [Implementation roadmap](docs/roadmap.md)
5. [Contributing and public repository policy](CONTRIBUTING.md)

No project build or test commands are defined yet. The first implementation milestone will establish a reproducible baseline and the supported API surface before selecting a backend.

## Initial package boundary

```text
website-scrap-engine
  download policies, URL hooks, scheduling, resource lifecycle
        |
        v
GroveDOM JavaScript/TypeScript facade
  load / callable $ / chainable Cheerio-style selections
        |
        v
ordered operations + observation/flush boundaries
        |
        v
kernel backend
  parse, select, traverse, mutate, serialize, own memory
```

Binary opcodes, pointers, and internal memory layout are private implementation details. Package users should not depend on Lexbor types or a specific Wasm memory representation.

## Development prerequisites

Start with Node.js 22 or newer for API inventory and baseline work. Native prototypes need the selected kernel's compiler and Node-API headers. C/Wasm requires a suitable sysroot/libc in addition to Clang and wasm-ld; Rust/Wasm requires a matching target standard library. See [toolchain requirements](docs/research.md#minimal-toolchains-and-cross-compilation) before adding build dependencies.
