# Compatibility status

GroveDOM implements a tested subset of Cheerio. “Supported” means covered by
scoped behavior and lifetime checks; it does not promise complete parity or
production readiness. “Best-effort” marks remaining differences or validation
gaps. Unsupported APIs do not silently fall back to another parser.

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

Internal calls between public methods are implementation details. Replacing
`each`, for example, does not provide a supported interception point for other
operations such as `is` or `removeData`. Explicit calls to user callbacks retain
their documented ordering, arguments and receiver.

## Selection modes

Since 0.1.3, the API offers two document factories on all three entries:

| Factory | Selection node access | TypeScript API / selection |
|---|---|---|
| `load()` | Numeric indexing, `.get()` and iteration | `GroveDOMAPI` / `Selection` |
| `loadFast()` | `.get()` and iteration | `FastGroveDOMAPI` / `FastSelection` |

Both accept the same input, parser options and fragment argument. They share
initialization, methods, callbacks, snapshots and lifetime rules. Choose the
mode when creating a document; chains, root selections, node-valued maps and
nested `$.load()` keep it. Generic value collections from `.map()` still have
numeric indexing. Fast selections do not implement numeric reads, writes or
enumeration; assigning an ordinary property such as `selected[0]` does not edit
their membership. Use `.get(index)`, iteration and `.splice()` as appropriate.

Both modes can coexist in one entry. A CSS query with a foreign selection or
node context delegates to that context's document and returns its mode. Markup
construction still belongs to the receiving document. Types conservatively
reflect both possibilities when the context can have another mode. This does
not enable cross-document node adoption: passing another document's nodes as
ordinary input or mutation content remains unsupported. Package entries still
own independent handle brands.

The two modes share their method prototype. Internal calls remain unsupported
interception points, and undocumented fields have no compatibility promise.
The [measured comparison](history/mode-initialization.md) favors plain selections
for public callbacks in its bounded diagnostic, without establishing a general
complete-workload gain.

## Options

`load(content, options?, isDocument?)` and `loadFast()` accept `scriptingEnabled`, `baseURI`,
`execution: 'buffered' | 'direct'`, `xml` and `xmlMode`. Unknown parser options
are rejected. HTML uses the audited Cheerio/parse5 defaults; there is no
htmlparser2 HTML mode. See [the declarations](../src/index.d.ts) for signatures.

HTML-mode SVG/MathML follows **Cheerio's default behavior**: adjusted `xlink:href`
is exposed as `href`, while `[viewBox]` and `foreignObject` do not match camel-case
SVG names. Raw names and serialization retain case/namespace metadata. Foreign
`style`/`script` text is escaped so reparsing does not turn it into markup.
Select parsing has targeted parse5-compatible insertion modes; other parser-version
recovery is best-effort. Foreign-fragment CDATA follows the tested WPT behavior
even where Cheerio/parse5 differs.

XML preserves qualified, case-sensitive names. Its options include
`decodeEntities`, `lowerCaseTags`, `lowerCaseAttributeNames`, `selfClosingTags`,
`emptyAttrs`, `encodeEntities`, `xmlMode`, `recognizeSelfClosing` and
`recognizeCDATA`. It does not validate XML, fetch resources or expand DTD entities.
With `encodeEntities: false`, text is verbatim but attribute quotes still become
`&quot;`. Per-call serializer options cover the implemented XML serialization controls.
Static `html`/`xml` keeps an existing selection's own rendering options; pass its
`.get()` node array to apply per-call options.

## Lifetime and boundaries

Selections snapshot membership; callbacks observe preceding writes. Observed
detached nodes remain valid until `$.dispose()`, which is idempotent, discards
pending commands and invalidates handles. Returned strings/arrays remain valid.
Handles stay within their document, worker and package. GC cleanup has no deadline
guarantee. See [ownership and memory](memory.md) for pool limits and retained capacity.

## Selectors

Scoped `.find()` follows Cheerio's ancestry boundary, including overlapping roots
and nested predicates. Ancestors outside the context cannot satisfy a normal
selector chain; `.filter()` and `.is()` inspect full ancestry. Browser
`Element.querySelectorAll()` differs here. Root position and sibling predicates
retain the original tree relationships; fragment `:root` follows Cheerio.

Template query unions preserve scope and order. A template element does not cover
an explicitly supplied inner content root. Child-relative/descendant lists such
as `find('> p, div p')` and the reverse order share that behavior. Quoted, escaped
and nested commas do not split clauses; CSS comments do not expand aliases and
quoted operands remain literal.

| Selector case | Status / difference |
|---|---|
| Trailing positional chains | Supported; escaped identifier colons stay literal |
| Relative selectors in `filter`/`is`, mixed child/sibling lists, positional lists such as `p, p:first` | Unsupported; fail explicitly |
| Lists returning the context through `:scope`, or mixing sibling-relative and absolute clauses | Best-effort; Cheerio also varies some results by clause order |
| Negative positional indices | Best-effort; `filter(':lt(-1)')` excludes the last entry, while the current Cheerio reference retains all entries |
| Unicode comparisons | Baked Unicode 17.0 data with css-select's operator-specific rules |
| Class/token whitespace and empty operands | Follow Cheerio, including differences from browser CSS |
| Literal U+00A0/U+2003 identifiers | Imported escape cases pass; NBSP support extends css-what |
| `:enabled` | Can match non-controls, following Cheerio |

CSS block/function nesting above **512**, after alias expansion, is rejected
before parsing. Strings, comments and escaped delimiters do not count toward
that bound. The compatibility matcher has a separate **64-level** guard.
Rejection preserves preceding writes, handles and subsequent queries; these
guards are not a universal resource-exhaustion guarantee.

## Observable API behavior

The [source audit](source-audit.md) provides reproducers and implementation detail;
the [0.1.1 changelog](../CHANGELOG.md#011) identifies corrections from 0.1.0.

| Operation | Contract / remaining difference |
|---|---|
| `not(callback)` | Evaluates each duplicate occurrence independently with its original index |
| Property/CSS maps | Visit each element and then its keys, preserving getter/callback observations |
| Property callback results | Ordinary values stringify, including null/undefined; boolean properties retain presence semantics |
| `prop('attribs', replacement)` | Copies exact stored names/values; reassigning its own live view preserves values and callback edits. Objects are not shared, so later external changes do not edit the DOM |
| Attribute names | Preserve exact spelling through cloning/serialization, including SVG `viewBox` and distinct `ID`/`id`. HTML selector case rules still apply; uppercase `ID` is not the lowercase ID value. Non-ASCII whitespace in names is supported |
| `removeAttr` | Uses a separate whitespace-delimited name-list contract |
| Element data | Raw `data` assignment replaces the store by reference. `prop('data', value)` replaces an existing store; before one exists, it edits an ordinary attribute |
| Text/comment data | Raw `data` writes edit character data; raw property getters on these nodes are extensions |
| Forms | Ordinary setters dispatch from the first selected node; empty XML `multiple=""` has Cheerio's falsey getter behavior. Type matching ignores case in HTML and is exact in XML |
| Extraction | Reads each descriptor's selector/value once before querying, even without matches. Callback arrays flatten once, keeping null/undefined entries; scalar null/undefined results are omitted. Type inference follows this behavior |
| Insertion callbacks | Append/prepend accepts document/template-content roots. A callback as the first insertion argument causes later arguments to be ignored |
| Detached `before`/`after` callbacks | Best-effort: callbacks can run even when no insertion occurs |
| Existing-node `replaceWith` | Moves the same nodes through targets; self-replacement keeps neighbors intact and repeated insertion references retain one physical node |
| Clones | Share a hidden container with reciprocal sibling links; first-child tests on multiple cloned roots can differ from Cheerio |
| `wrapAll` | Skips lowercase script/style nodes when choosing the container, including XML wrapper-clone behavior |
| Relation aliases | Return the same handle identities; direct writes to read-only node types/relations fail |
| Convenience behavior | HTML/value callbacks, whole-class toggles and derived property setters extend Cheerio; an empty selection's `.html()` is `null`, unlike jQuery's `undefined` |

GroveDOM preserves consistent tree links rather than reproducing Cheerio's
inconsistent cloned-root links or neighboring-node deletion in self-replacement.

## Qualification

Experimental **0.1.3** has scoped [selection-mode and package qualification](testing.md#released-013-selection-modes)
and a [reported development CI pass](testing.md#013-ci-follow-up).
The CI matrix covers Linux Node 22.0.0/22/24 and pooled Wasm on Windows/macOS
with Node 24, including packed installs. Native remains Linux x64/glibc only;
[release policy](releasing.md) defines that baseline.
The reported 0.1.1 Firefox 150 and Chromium 140
[correctness-page runs](testing.md#reported-browser-runs)
each pass 810 cases with 35 skips and no failures. WebKit and broader browser API
coverage remain unqualified; portable normal/fallback checks run under Node.

[Fourteen Cheerio/jQuery exclusions](../test/upstream/README.md) and the selected
[WPT exclusions](../test/web-platform/README.md) have explicit reasons. Tests for
other backends/heaps also skip. [Testing](testing.md) records the full scoped
matrix; [integration](integration.md) describes the consumer replay. Correctness
passes do not establish [performance or production adoption](benchmarks.md).
[Historical inventory](history/compatibility.md) retains earlier API audits.
