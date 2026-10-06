# Compatibility status

“Supported” means covered by the implemented API and scoped differential/lifetime
tests. It does not promise every Cheerio edge case or production readiness.
“Best-effort” identifies behavior or environments without that full validation.
Unsupported operations should fail explicitly rather than silently select a
slower parser or omit required work.

| Area | Status | Contract / limits |
|---|---|---|
| Node/Wasm pooled target | Primary, supported | Synchronous DOM calls; Node 22/24 tested; explicit disposal |
| Shared/fresh Wasm heaps | Supported alternatives | Same API; different retention and initialization costs |
| Native Node-API | Secondary | Linux x64/glibc package; independent initialization, same facade contract |
| Browser ESM entry | Best-effort | Async init, then synchronous DOM; same Wasm; no Node imports |
| Caller-managed Node workers | Supported | Independent documents per environment; no shared handles |
| HTML documents/fragments | Supported subset | Lexbor parsing with audited Cheerio defaults and context |
| Templates | Supported subset | Content traversal, selectors, mutation and serialization |
| XML/SVG | Supported subset | Case-sensitive XML names, options below; no validating processor |
| Queries/traversal | Supported subset | CSS, audited aliases, relative selectors and collection operations |
| Mutations/callbacks | Supported subset | Attr/text/HTML, insertion/removal, clone/wrap, classes; ordered observations |
| Raw node properties | Supported subset | Stable identity, name/type, attributes, data and relations |
| CSS/data/forms/extract | Supported subset | Covered operations; no browser layout/style computation |
| UTF-8 input | Supported | Strings and byte arrays; no encoding sniffing |
| Malformed-input/error parity | Best-effort | Safety required; exact Cheerio recovery/messages are not a gate |
| General out-of-memory recovery | Best-effort | Owned buffer failures tested; upstream allocator exhaustion not exhaustive |
| Full Cheerio plugin/domhandler compatibility | Unsupported | No unrestricted raw tree splicing or hidden internal API promise |
| Cross-document node adoption | Unsupported | Transfer markup; do not move handles between documents/packages |
| Streams, network loading, loadBuffer sniffing | Unsupported | Decode/fetch outside GroveDOM |
| Browser JavaScript, layout, resource fetching | Unsupported | DOM transformation only |

## Options

`load(content, options?, isDocument?)` supports `scriptingEnabled`, `baseURI`,
`execution: 'buffered' | 'direct'`, `xml` and `xmlMode`. Unknown parser options
are rejected. HTML defaults preserve the audited Cheerio/parse5 contract;
GroveDOM does not implement an htmlparser2 HTML mode.

HTML-mode SVG/MathML follows **Cheerio's default behavior**, including its
differences from browsers: adjusted `xlink:href` is exposed as `href`, and
`[viewBox]` and `foreignObject` do not match camel-case SVG names. Raw names and
HTML serialization retain their case and namespace metadata. Explicit XML mode
keeps qualified, case-sensitive names. Foreign `style`/`script` text is escaped
during HTML serialization, so reparsing does not turn text into markup.

XML options include `decodeEntities`, `lowerCaseTags`,
`lowerCaseAttributeNames`, `selfClosingTags`, `emptyAttrs`, `encodeEntities`,
`xmlMode`, `recognizeSelfClosing` and `recognizeCDATA`, within the documented
XML mode. XML is non-validating, does not fetch external resources, and does not
expand DTD entities. Per-call serializer options cover the implemented XML
serialization controls. See [the declarations](../src/index.d.ts) for exact
method signatures; they intentionally expose a partial Cheerio surface.

## Lifetime and boundaries

Selections snapshot membership, callbacks observe preceding writes, and detached
observed nodes survive until disposal. `$.dispose()` is idempotent, discards
pending commands, releases document ownership and invalidates handles. Returned
strings/arrays remain valid. Do not transfer handles across workers or packages.
GC cleanup is secondary and has no guaranteed deadline.

Fourteen selected Cheerio/jQuery cases remain excluded; their reasons are in
[test/upstream/README.md](../test/upstream/README.md). Tests specific to another
backend/heap also skip. Hosted CI passed on Linux with Node 22.0.0 and maintained
Node 22/24, plus pooled Wasm on Windows and macOS with Node 24. Packed installs
are checked on those platforms; the native package remains Linux x64/glibc only.
Browser graph/portable-path checks run under Node, not Chromium/Firefox/WebKit.
The [CI release policy](releasing.md) defines the native build baseline and
platform matrix. Both 0.1.0 npm packages match the validated artifact hashes.

The [WPT-derived suite](testing.md) adds independent HTML/CSS/DOM expectations.
Literal U+00A0 and U+2003 identifiers now pass the imported escape cases;
NBSP acceptance is a best-effort extension beyond css-what. Attribute names containing
non-ASCII whitespace are supported. Cheerio's `:enabled` can match non-controls,
and an empty selection's `.html()` returns `null`, unlike jQuery's `undefined`.
Foreign-fragment CDATA follows the tested browser-standard behavior even where
Cheerio/parse5 differs. These distinctions are tested, not hidden fallbacks.

Scoped `.find()` follows Cheerio's ancestry boundary, including overlapping
contexts and nested selector predicates. Ancestors outside the context cannot
satisfy an ordinary selector chain; `.filter()` and `.is()` still inspect the
node's full ancestry. Browser `Element.querySelectorAll()` differs here. Root
position and sibling predicates retain the original tree relationships.

Trailing positional chains are supported, with some negative-index behavior
remaining best-effort. For example, GroveDOM's `filter(':lt(-1)')` excludes the
last element, while the current Cheerio reference retains the whole selection.
The regex hardening preserves this existing distinction.

The [source audit](source-audit.md) records additional fixes and confirmed limits.
Unicode selector comparisons use baked Unicode 17.0 data and css-select's
operator-specific rules. Class/token whitespace and empty token operands follow
Cheerio, including differences from browser CSS. Select parsing uses targeted
parse5-compatible insertion modes; other parser-version recovery is best-effort.
Clones share a hidden container but keep consistent native prev/next links,
unlike Cheerio's cloned-root links. First-child tests on multiple cloned roots
can therefore differ. Fragment `:root` follows Cheerio. HTML callbacks and
whole-class toggles remain GroveDOM conveniences; form array setters now follow
the covered Cheerio behavior. See the audit for exact limits.

[Integration](integration.md) describes the real consumer replay.
[Historical inventory](history/compatibility.md) preserves the detailed earlier
API audit and exclusions; current support status is the table above.
