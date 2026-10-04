# Wasm stack

The default reserves **32 KiB of linear-memory stack** inside the 1 MiB initial
memory. This does not bound the separate JavaScript/Wasm engine machine stack.

The earlier source/disassembly audit and expanded workload suite observed a
maximum pointer depth of 6,256 bytes and written watermark of 6,200 bytes, with
all pointers restored. The 5.2× measured headroom is not a worst-case proof.
The refactor repeated 96 sentinel runs across 122 compiled write sites and
observed the same maxima, with every pointer restored.
Compatibility matching has depth guards; XML/tree walkers are iterative. Some
upstream selector-AST cleanup still recurses on the engine stack.

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
