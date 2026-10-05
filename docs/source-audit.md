# Source compatibility audit

This audit pairs upstream implementation branches with small differential
reproducers beyond the saved MDN workload. It does not establish complete
Cheerio compatibility. The initial fixes required no dependency update. A subsequent
[compatibility patch](../native/patches/README.md) connects GroveDOM-owned helpers
to the pinned matcher and select parser; it changes no public binding protocol.

## Sources examined

| Dependency | Installed version | Paths examined |
|---|---|---|
| Cheerio | 1.2.0 | Attributes/data/classes, properties/forms, CSS, traversal, manipulation, parse5 adapter |
| cheerio-select / css-select / css-what | 2.1.0 / 5.2.2 / 6.2.2 | Positional filtering, attribute operators, pseudo aliases, selector compilation |
| domutils / domhandler | 3.2.2 / 5.0.3 | Text extraction, sibling traversal, cloning and node construction |
| parse5 / its htmlparser2 tree adapter | 7.3.0 / 7.1.0 | Fragment insertion modes, serialization, namespace and doctype metadata |
| htmlparser2 / dom-serializer | 10.1.0 / 2.0.0 | XML tokenization, decoding and serialization |
| entities | 4.5.0 / 6.0.1 / 7.0.1 | Serializer / parse5 / htmlparser2 dependency copies respectively |
| Lexbor | [Pinned revision](../native/dependency.json) | Selectors, fragment parsing, DOM attributes and serialization |

Public references include
[Cheerio attributes](https://github.com/cheeriojs/cheerio/blob/v1.2.0/src/api/attributes.ts),
[css-select attributes](https://github.com/fb55/css-select/blob/v5.2.2/src/attributes.ts),
[parse5 serialization](https://unpkg.com/parse5@7.3.0/dist/serializer/index.js) and
[entities decoding](https://unpkg.com/entities@7.0.1/dist/esm/decode-codepoint.js).

## Fixed behavior

[Authored regressions](../test/source-parity.test.mjs) cover both native and Wasm,
including buffered/direct and HTML/XML callback paths.

| Area | Previous difference | Current behavior |
|---|---|---|
| Attribute callbacks | Normalized values; callbacks on text/comments; undefined return ignored | Raw stored values, element-only callbacks, returned values stringified |
| Attribute maps | Coercion grouped by key or performed once | Per-element key/coercion order and observations of preceding writes |
| Data | First access cached every attribute; dashed keys collapsed | Per-key lazy cache, exact explicit keys, later attributes discovered |
| Classes | Whitespace normalized; all duplicate toggle tokens removed | Cheerio spacing and duplicate behavior; class methods use JavaScript whitespace |
| Boolean properties | Only boolean inputs used presence semantics; boolean `ismap` | Truthiness for Cheerio's boolean list; ordinary `ismap` value |
| Form/link pseudos | Wrong `<map>` match, missing implicit selected option, custom-element state | Cheerio aliases for `:any-link/:checked/:disabled/:enabled`; static `:active/:hover/:visited` never match |
| Attribute selectors | HTML case defaults restricted to HTML namespace | Defaults also cover SVG/MathML in HTML mode; explicit flags and XML case respected |
| Traversal | Sorting/deduplication before positional filters | Filter before postprocessing; `.filter()` preserves duplicate entries |
| Root selector | Detached/fragment children missed | Cheerio's non-element-parent rule |
| Markup insertion | Destination context used for append/prepend/siblings | Default template context for insertion strings; `html(value)` retains destination context |
| Text/metadata | `innerText` crossed fragment roots; doctype data absent | domutils root/template rules and parse5-adapter doctype name/data |
| XML references | Numeric C1 references decoded literally | htmlparser2/entities mapping, including `&#x80;` to `€`; literal controls unchanged |
| Styles/wrapping | Continuation whitespace lost; null CSS callback stringified; wrapper callbacks skipped | Cheerio's observed values and mixed-node callback order |

The imported jQuery class-whitespace case and WPT fragment `:root` case retain
their original assertions as explicit exclusions because they differ from
Cheerio. Exclusions do not count as passes.

## Follow-up gap fixes

[Gap regressions](../test/compatibility-gaps.test.mjs) cover:

- Unicode insensitive comparisons with css-select's operator-specific rules:
  lowercase plus UTF-16 lengths/slices for equality/prefix/suffix/hyphen, and
  non-Unicode regular-expression canonicalization for substring/token matches.
  Expanding lowercase, contextual Greek sigma, astral case pairs, Kelvin sign
  and long s are tested. Unicode 17.0 data is baked into C; regeneration uses
  [the checked generator](../scripts/generate-unicode.mjs), not runtime ICU.
- JavaScript whitespace in class/token selectors, including guards and the
  class summary. Empty token operands follow Cheerio's regex boundaries.
- Shared hidden clone containers for siblings, wrapping and movement, while
  preserving reciprocal native links and retained handles.
- parse5-style select parsing in documents, table contexts and fragments.
  The targeted insertion modes do not alter XML or add a second parser.
- Array form setters: single selects remain unchanged; checkbox/radio values
  are assigned without toggling checked state. HTML callback conveniences skip
  text/comment entries and preserve original element callback indices.

The previous 1,711-comparison source probes now leave six mismatching
comparisons: whole-class toggle conveniences (three), HTML callbacks, clone
first-child behavior and the prototype of the attribute snapshot returned by
an array-value probe. That last probe has identical stored attributes and
serialization. One reference-only selector error remains outside comparisons.
A separate 588-case select recovery probe matches Cheerio on both backends.
These are diagnostic comparisons, not distinct defect counts or full coverage.

## Remaining differences

These are confirmed limits. Cartesian probes repeat some differences across
operators, flags and document modes; they are not independent defect counts.

| Reproducer | Cheerio | GroveDOM / status |
|---|---|---|
| Unicode data version | Uses the host JS engine's Unicode data | Baked Unicode 17.0; newly assigned characters can differ on engines with other Unicode revisions |
| Two selected nodes cloned together | Root prev/next links are absent; both roots can match first-child | Shared container with reciprocal links; only its first element matches first-child. This deliberate best-effort difference protects consistent native tree operations |
| Literal NBSP identifier | css-what rejects that spelling | Accepted as a WPT extension; escaped spellings work in both |
| `.html(callback)`, `.toggleClass()` / boolean argument | Not equivalent callback/toggle operations in Cheerio 1.2.0 | Retained GroveDOM conveniences; avoid for exact parity |
| Raw attribute snapshot prototype | domhandler null-prototype object | GroveDOM ordinary-object snapshot; stored values/serialization match |

Parser recovery beyond the targeted select modes and the other documented
unsupported APIs remain best-effort. These changes do not claim complete
Cheerio equivalence.

The initial source audit had no elapsed-time benchmark. Follow-up timing and
profiling are recorded separately in [benchmarks](benchmarks.md); historical
adoption ratios are not measurements of these fixes.
