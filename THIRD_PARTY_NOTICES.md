# Third-party notices

GroveDOM's own code is [MIT licensed](LICENSE). Bundled third-party code retains
its original terms. Both target packages include this notice and `licenses/`;
the Wasm runtime entries below apply only to `grovedom`.

| Component | Applies to | Source and terms |
|---|---|---|
| Lexbor | Wasm and native binaries | [Pinned source](https://github.com/lexbor/lexbor/tree/f4cbbcd91359a0ec9499e3ce7e263de629482d61); [Apache-2.0 and BSD-2-Clause subcomponent terms](licenses/lexbor/LICENSE), plus [NOTICE](licenses/lexbor/NOTICE) |
| wasi-libc | Wasm binary | [Pinned source](https://github.com/WebAssembly/wasi-libc/tree/574b88da481569b65a237cb80daf9a2d5aeaf82d); [licensing overview](licenses/wasi-libc/LICENSE), [Apache-2.0 with LLVM exceptions](licenses/wasi-libc/LICENSE-APACHE-LLVM), [Apache-2.0](licenses/wasi-libc/LICENSE-APACHE) and [MIT](licenses/wasi-libc/LICENSE-MIT) |
| musl within wasi-libc | Wasm libc routines | [Copyright and license](licenses/wasi-libc/musl-COPYRIGHT); [qsort notice](licenses/wasi-libc/musl-qsort-NOTICE) |
| dlmalloc within wasi-libc | Wasm allocator | [Public-domain/CC0 dedication](licenses/wasi-libc/dlmalloc-NOTICE) |
| cloudlibc within wasi-libc | Wasm libc support | [BSD-2-Clause](licenses/wasi-libc/cloudlibc-LICENSE) |
| LLVM compiler-rt | Wasm compiler runtime archive supplied at link time | [Pinned source](https://github.com/llvm/llvm-project/tree/ab4b5a2db582958af1ee308a790cfdb42bd24720/compiler-rt); [license, including LLVM exceptions and legacy terms](licenses/compiler-rt/LICENSE.TXT) |

The reviewed Wasm libraries come from [wasi-sdk 25](https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-25).
Its [source pins](https://github.com/WebAssembly/wasi-sdk/tree/wasi-sdk-25/src)
identify the wasi-libc and LLVM revisions above. Only linked portions are included
in the binary; the wasi-libc overview also describes optional components such as
emmalloc and musl-fts that this build does not use. Lexbor includes a reviewed namespace-aware text serialization modification.
The [patch record](https://github.com/website-local/grovedom/blob/main/native/patches/README.md) identifies the change; modified
Lexbor source remains under Apache-2.0.
Recheck these notices when changing dependency revisions, runtime libraries or
linked components.

Development tests derived from Cheerio and jQuery retain their MIT notices in
`test/upstream/` in the source repository; WPT fixtures retain their BSD-3-Clause
notice in `test/web-platform/`. Those tests and libraries are not
bundled in either package. The browser demo optionally imports Cheerio from a
CDN; it is separate from the package runtime.
