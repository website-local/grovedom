# GroveDOM

DOM transformations through ordered operations.

GroveDOM is an experimental JavaScript-facing HTML/XML DOM package for workloads with many queries and mutations. Its initial integration target is `website-scrap-engine`, using MDN offline transformations as a representative workload.

**Status: C/Lexbor prototypes for Linux Node-API and direct Wasm are implemented. The API is partial; the full-workload performance and adoption gates remain unproven.** See the [prototype guide](docs/prototype.md) for build commands, tested behavior, and limitations, and the [compatibility inventory](docs/compatibility.md) for the public API boundary.

## Objective

Replace the required Cheerio workload with an implementation that preserves required behavior and takes **at most one third of the elapsed time** of the current Cheerio implementation, including parsing, queries, mutations, JavaScript/kernel transfers, serialization, and lifecycle costs.

GroveDOM must also be faster than the best behaviorally acceptable Cheerio configuration using **either `parse5` or `htmlparser2`**. Both are mandatory baselines, including their practical optimizations. The existing 3× target remains relative to current Cheerio; the additional gate is a demonstrated win over the fastest compatible configuration, not a new 3× multiplier over htmlparser2.

Performance on normal successful workloads is the first priority. Exact invalid-input behavior and error-message parity with Cheerio are not adoption gates. Successful output behavior and safe ownership remain required.

## Agreed direction

- A separate DOM package with an application-independent API and downloader-specific integration kept in `website-scrap-engine`.
- One ordered operation stream per document. Flush when JavaScript needs pending results, before supported callback observations, explicitly, and before final output.
- Selections, intermediate strings, and mutations stay in the kernel where possible.
- Keep implementation and build tooling simple. Use Node scripts and the selected kernel's compiler/build tools; introduce Python only if an unavoidable dependency requires it.
- Synchronous execution on the calling thread, including caller-managed Node workers with independent documents. GroveDOM creates no threads or worker pool and provides no shared-document execution, out-of-order scheduler, speculation, or JIT.
- Use document-owned arenas/pools, reusable command and scratch buffers, and bounded caches. Avoid unnecessary copies, per-node temporary objects, and small heap allocations inside hot loops; verify leaks, fragmentation, and memory retained after disposal.
- Kernel and binding choices remain open until measured. Compare Lexbor/C and an arena-backed `html5ever`/Rust stack; compare direct Wasm exports and ordinary Node-API bindings.
- For Wasm, compare a shared instance/heap, a fresh instance/heap per document, and a bounded pool of reusable instances. All reuse the compiled module.
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
6. [Runnable prototype and compatibility inventory](docs/prototype.md)

With the prototype's existing-toolchain prerequisites and disk-backed environment configured, run `npm run build:native`, `npm test`, `npm run test:types`, and `npm run bench`. The benchmark uses authored deterministic fixtures and both Cheerio parsers; it is not the complete engine/MDN replay. The production backend remains undecided.

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
