# Stack audit

The chosen Wasm stack reservation is **32 KiB**, reduced from 64 KiB. Initial linear memory remains 1 MiB, including the stack, static data and the existing 16 KiB transfer area. The released 32 KiB becomes allocator headroom; it does not automatically reduce the number of allocated 64 KiB memory pages.

This audit covers GroveDOM's facade and kernel, the reachable parts of the [pinned Lexbor dependency](../../native/dependency.json), and the libc routines linked into the import-free Wasm module. Native Node-API execution uses the process stack. JavaScript and Wasm call frames also use the engine's separate machine stack; neither is the linear-memory reservation configured here.

## Recursion and ownership

| Path | Implementation and stack consequence |
|---|---|
| XML parsing, decoding and serialization | Iterative scans and parent links in [xml.c](../../native/xml.c); input depth does not create a C frame per element. XML has no external-entity fetch or parser callback into JavaScript. |
| DOM walking, text, removal, templates and serialization | Iterative traversals in [kernel.c](../../native/kernel.c). Template contents become ordinary fragment children. The exposed-tree clone path uses Lexbor's iterative document import walk; specialized interface constructors clone one node at a time. |
| Ordinary CSS parsing and matching | Lexbor uses parser-rule and selector-entry storage in document-owned pools, with iterative dispatch loops. Deep ordinary selector nesting is not handled by GroveDOM's recursive compatibility matcher. |
| Compatibility CSS matching | [selectors.c](../../native/selectors.c) recursively handles nested pseudos and selector combinators. Every recursive matching edge advances the depth counter, checked at 64. The rejecting entry can be the 65th frame; at 96 bytes per compiled frame plus the caller, this explains the 6,256-byte maximum. DOM traversal within `:has` remains iterative. |
| HTML tokenizer and tree construction | Tokenizer/tree callbacks are internal C functions. The outer loops process state changes and token reprocessing. Direct-call cycles between body/head/template handlers are conditional on token kinds; template EOF handling pops state and returns to the outer loop. The tokenizer unref routine can follow an inherited tokenizer, but GroveDOM uses initialized base tokenizers and does not call the inheritance API. |
| HTML mutation hooks | DOM descendant notification walks are iterative. The linked select/option/selectedcontent hooks update selectedness or clone through the ordinary import walk. Insertion selectedness callbacks do not recursively invoke the option-pop cloning path. XML disables these HTML hooks. |
| CSS error cleanup | Lexbor can recursively destroy nested selector ASTs through its destructor dispatch table. The recursive destruction routines reserve no linear-stack frame in the audited builds. This is still engine/native call-stack recursion; an arbitrarily deep malformed selector is not promised to fit that separate stack. Normal document disposal and cache resets release the CSS arena together. |
| Allocator, sorting and strings | The linked libc allocator and memory/string routines use fixed frames or loops. The sort is iterative smoothsort; its comparator only compares stored node order. Its fixed sort/helper frames can overlap, but do not grow with the number of elements. No user comparator or JavaScript callback runs inside it. |
| Facade and caller callbacks | Relative selector decomposition, nested extraction descriptors, nested content/class arrays, and function-valued setters can recurse in JavaScript. Caller callbacks/coercions can also reenter the facade. Kernel calls return before invoking this user code, so these calls do not retain an earlier Wasm linear-stack frame. Their engine-stack limits are unchanged by this setting. |

The source review includes Lexbor's DOM `document.c`/`node.c`, HTML tokenizer/tree insertion modes and mutation interfaces, CSS selector destruction/parser states, and selector evaluator. The linked release disassembly complements the source audit: 724 functions, 120 writes to the linear stack pointer, and 60 functions with fixed reservations and matching restores. The largest individual reservation is 496 bytes; all distinct reservations sum to 2,912 bytes. That sum is a diagnostic inventory, not a worst-case call-chain bound: recursive multiplicity and indirect-call feasibility must be considered separately.

Empty-text compatibility also routes `:empty` through the bounded matcher on
documents without templates. It uses the same depth guard; it does not add a
recursive DOM walk. Compiler and post-link optimization experiments must repeat
the stack diagnostic on their own generated code.

The direct-call graph identifies the compatibility matcher, tokenizer unref, and HTML insertion-mode cycles. Indirect calls were also reviewed through allocator hooks, selector destructors, parser state tables, DOM interface/mutation tables, serializers, match collectors and the sort comparator. A direct-call graph alone would miss the AST cleanup recursion.

## Measurements and decision

The [stack diagnostic](../../bench/stack.mjs) instruments every stack-pointer assignment in a temporary module and checks two sentinel patterns. Its expanded 48 workloads include:

- The four full sitemap/SVG replays and eight restored MDN inputs.
- Deep HTML, XML and template trees, including 5,000 unfinished templates.
- Nested pseudos, child/sibling combinators and `nth-child(... of ...)` at the compatibility limit.
- Malformed selector recovery at depths 100 and 2,000, plus numeric-token errors.
- Sorting 5,000 nodes, malformed formatting recovery, and selectedcontent cloning.

| Build, with a 32 KiB reservation | Instrumented writes | Maximum pointer depth | Maximum written watermark |
|---|---:|---:|---:|
| O3 / ThinLTO | 120 | 6,256 bytes | 6,200 bytes |
| Kernel O2 / Lexbor O3, LTO off | 140 | 6,256 bytes | 6,200 bytes |
| Wasm-first selector/memory candidate, O3 / ThinLTO | 122 | 6,256 bytes | 6,200 bytes |

Every pointer restores. The only reported errors are the expected compatibility-selector depth rejections. Ordinary sitemap/SVG replays reach 48 bytes in the default build; the 5,000-node sort reaches 1,216 bytes. Both configurations use the existing compiler and prebuilt libc/builtins. The second changes GroveDOM to O2 and disables LTO; Lexbor retains the build script's O3 setting. No dependency source is patched.

The Wasm-first recheck instruments the actual selected release module, including
the scalar/bulk memory shadows, and repeats all 48 workloads with both patterns
and the eight restored MDN inputs. The new summary and guard-compaction walks
are iterative; they add no recursive edge. All pointers restore and the observed
maximum is unchanged. Separate temporary copies of the earlier Binaryen and
memory-helper candidates also pass their stack probes; optimizer results are
not assumed to share the LLVM artifact's stack usage.

32 KiB leaves about 5.2 times the largest observed depth while halving the former reservation. Keep this margin for unmeasured call combinations and compiler changes instead of deriving a minimum stack size solely from one watermark. The setting remains configurable with `GROVEDOM_WASM_STACK_BYTES`; rerun the audit and diagnostics after changing recursive kernel paths, dependencies or compiler settings. These observations support the chosen default; they are not a proof for every possible input or future build.
