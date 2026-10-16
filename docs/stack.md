# Wasm stack

The default reserves **32 KiB of linear-memory stack** inside the 1 MiB initial
memory. This does not bound the separate JavaScript/Wasm engine machine stack.

The current selector-hardening check ran **88 sentinel trials across 110 compiled
stack-pointer write sites**. The maximum observed pointer depth was **17,168
bytes**, and the maximum written watermark was **16,752 bytes**, both in
compatibility-matcher limit cases. Every stack pointer was restored. The trials
include accepted 512-level selectors and safe rejection/recovery for malformed
selectors with 128,000 nested functions; saved-page inputs were not included.
These are observed workloads, not a worst-case bound or an engine-stack measure.
The attribute/callback follow-up reproduced these counts and maxima.

Earlier source/disassembly and refactor checks observed 6,256 pointer bytes and
6,200 written bytes, including 96 sentinel runs across 122 compiled write sites.
Those historical measurements and their 5.2× headroom do not describe the current
artifact.

Compatibility matching has depth guards; XML/tree walkers are iterative. Some
upstream selector-AST cleanup still recurses on the engine stack. A shared-kernel
lexical guard now rejects CSS block/function nesting above 512 before parsing,
including malformed input. It ignores strings, comments and escaped delimiters;
the existing 64-level compatibility matcher guard remains separate.

`bench/stack.mjs` uses a separate stack-export build and instruments all compiled
stack-pointer assignments with existing LLVM tools. It checks deep trees,
templates, XML, selector limits, malformed cleanup, sorting and saved pages with
two sentinel patterns. Diagnostic runtime hooks are outside the release entries;
release binaries expose no stack globals or profiling exports.

Build with `GROVEDOM_WASM_PROFILE_STACK=1` in a separate output directory, then run
`node bench/stack.mjs`. Repeat after native source, dependency or compiler changes.
Never use this instrumented binary for release timing.

[Historical audit](history/stack.md) preserves function inventories, indirect-call
analysis and the original measurements.
