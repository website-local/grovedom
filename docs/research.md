# Dependencies and implementation decisions

The current kernel is pinned Lexbor/C with native Node-API and direct Wasm
bindings. Wasm/Node is the primary target; Rust remains an unmeasured alternative,
not another shipping backend. No dependency fork or library-managed threads are
introduced by the architecture split.

## Dependency pin

[native/dependency.json](../native/dependency.json) records the reviewed source
revision and fingerprint. Builds verify that source, independently of runtime
loading. The pinned revision includes upstream allocator and array fixes that
were absent from unpatched Lexbor 3.0.0. See the
[maintenance review](history/research.md#lexbor-maintenance-assessment) for source
references and rationale.

GroveDOM owns its glue/kernel artifact pairing. Runtime loaders no longer read
package/build JSON or compare versions; package assembly copies the selected
artifact and generated ESM constants together. Diagnostic build metadata can be
kept for reproducibility, but release loading does not depend on it.

## Wasm portability

Node and browser entries load the same import-free binary. The reviewed linked
libraries declare bulk memory, multivalue, mutable globals, reference types and
sign extension. An empty optional compiler-feature list is **not** MVP-only Wasm.
No SIMD, shared-memory or thread requirement is added. See the
[linked-feature audit](history/research.md#linked-wasm-compatibility).

Browser loading uses ordinary fetch plus async compilation and a portable
TextEncoder/TextDecoder path. Node retains Buffer decoding for performance.
Browser support remains best-effort until actual engine/version testing; the
portable module graph check alone cannot establish that matrix.

## Tooling and scope

Existing Node, Clang/LLVM, CMake/Ninja, reviewed Lexbor and WASI sysroot/builtins
are sufficient for the current builds. Do not install compilers or introduce a
new binding/code-generation stack merely for packaging. Build settings can use
developer environment variables; public runtime options use `init`.

[Historical research](history/research.md) preserves parser comparisons, source
links, allocator findings, threading rationale and rejected optimization ideas.
Those comparisons are not current full-workload backend rankings.
