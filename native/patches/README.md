# Reviewed Lexbor patches

The upstream revision and source fingerprint remain pinned in
[`dependency.json`](../dependency.json). Each patch has its own SHA-256; the
manifest also pins the complete resulting tree. Native and Wasm builds verify
all three inputs and apply patches to a build-local copy. They never modify the
provided upstream directory. An altered patch, upstream tree or prepared cache
fails the build. Build metadata records the effective source fingerprint.

| Patch | Reason | Regression coverage |
| --- | --- | --- |
| [`lexbor-foreign-text.patch`](lexbor-foreign-text.patch) | Restrict raw-text serialization to HTML namespace parents. SVG and MathML text must escape markup characters even inside elements named `style` or `script`. | [`foreign-content.test.mjs`](../../test/foreign-content.test.mjs): namespace/tag combinations, serialize/reparse, ordinary HTML controls |
| [`lexbor-cheerio-hooks.patch`](lexbor-cheerio-hooks.patch) | Route class/insensitive attribute comparisons and select insertion modes to GroveDOM-owned compatibility helpers; accept literal non-ASCII identifier scalars. | [`compatibility-gaps.test.mjs`](../../test/compatibility-gaps.test.mjs), WPT escapes and owned-buffer fault checks |

The serialization change follows the namespace condition in the
[HTML fragment serialization algorithm](https://html.spec.whatwg.org/multipage/parsing.html#serialising-html-fragments).
Without it, serializing an SVG script containing an escaped tag can create a real
element when reparsed. The patch changes no parser or public Lexbor interface.
It has not been submitted upstream by this project; no upstream acceptance is
implied. The modified Lexbor source retains its Apache-2.0 license.

Keep patches minimal and independently reviewable. When updating Lexbor, check
whether each patch is still necessary, rebase or remove it explicitly, recompute
the fingerprints, and run the native/Wasm regressions and sanitizer checks.
Cheerio-specific attribute and selector behavior lives in GroveDOM's own kernel.

The compatibility patch adds three private link hooks, not a public Lexbor API.
The patched archive must link with GroveDOM. Comparison algorithms and the
parse5-compatible select modes live in `selector-values.c` and `html-select.c`;
ordinary HTML parsing and case-sensitive attribute comparisons retain Lexbor
paths. Unicode comparison scratch is lazy, document-owned and freed on disposal.
Generated Unicode 17.0 tables have a separate [license](../../licenses/unicode/LICENSE).
Literal NBSP identifiers are a WPT extension even though css-what rejects that
spelling; escaped forms work in both libraries.
