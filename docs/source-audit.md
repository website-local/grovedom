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

## Comparison with published 0.1.0

The release review also compares the actual 0.1.0 packages with Cheerio 1.2.0 and
the candidate. [Release regressions](../test/release-parity.test.mjs) cover HTML/XML
and buffered/direct execution, with installed-package and portable-entry checks.

| Area | Corrected behavior |
|---|---|
| Node-input `find` | `end()` returns the searching selection |
| Properties | Element-only callbacks keep original indices; ordinary values stringify; tag-name and URL callbacks read stored values |
| Raw relation properties | Declared `firstChild`/`lastChild`/sibling aliases return node identities; read-only type/relation writes fail explicitly |
| Property/CSS maps | Getter, callback and partial-effect order is per element, then per key; CSS map callbacks receive key indices |
| Extraction | Inherited enumerable descriptors participate; array callback results flatten one level with corresponding type inference |
| Existing-node replacement | Reuse the supplied node identity through multiple targets without implicit clones |
| Forms | Ordinary setters dispatch from the first node; null input values and XML empty `multiple` follow Cheerio |
| Positional suffixes | Escaped colons remain identifiers; unsupported selector lists fail explicitly |

The 30 targeted diagnostic scenarios improve from 13 to 27 exact matches. All
newly corrected differences were also present in published 0.1.0. The three
remaining scenarios concern raw property getters on mixed nodes, duplicate
physical insertion references and unsupported positional lists. These scenarios
are additional checks, not a complete compatibility measure.

Replaying the original 0.1.0 DOM tests against the candidate runs 1,611 cases per
backend. Nine old assertions differ: one jQuery whitespace case and six WPT
contexts now intentionally follow Cheerio, and two old expected-failure guards
detect Unicode identifiers that have been fixed. The original assertions and
results were retained; the current suite makes the seven policy exclusions
explicit and tests the corrected behavior separately.

## Edge-case coverage

The [callback edge cases](../test/callback-edge-cases.test.mjs) and
[template-root combinations](../test/template-query-roots.test.mjs) cover four
additional differences found after the release review:

| Area | Previous difference | Corrected behavior |
|---|---|---|
| `not(callback)` | Rejecting one occurrence removed every copy of that node | Each occurrence keeps its callback index and independent result |
| Extraction descriptors | Value getters ran for every match and never for empty results | Selector/value getters run once before querying; iteration keeps the captured value |
| XML form types | Case-insensitive type matching omitted uppercase controls | XML matches exact type names; HTML retains case-insensitive matching |
| Template query roots | Overlapping scopes could omit or reorder matches | Preorder traversal checks the union of scopes and preserves explicit inner roots |

The callback/form diagnostic has 72 comparisons across HTML/XML and both execution
modes. Template tests cover 3,380 root/selector combinations with duplicates,
fragment roots, nested templates and repeated queries. Fixed expectations also
exercise the four corrections through public package and portable-entry contracts.

[Attribute snapshots](../test/attribute-snapshots.test.mjs) and
[text snapshots](../test/text-snapshots.test.mjs) add large values, unusual own
property names, interleaved documents, mixed nodes, CDATA and retained detached
text. Owned-buffer fault checks cover query-generation rollover, multi-root
growth retries and fragment-parent restoration after failed template queries.

## Selector and attribute hardening

The [selector-safety regressions](../test/selector-safety.test.mjs),
[attribute replacements](../test/attribute-replacement.test.mjs) and
[relative lists](../test/relative-lists.test.mjs) retain three findings from the
readiness review:

| Trigger | Previous failure | Corrected behavior |
|---|---|---|
| Deep malformed selector functions | Recursive Lexbor cleanup crashed native processes; Wasm stack errors disrupted the next compound query | Reject nesting above 512 before parsing; retain the separate compatibility matcher guard |
| Attribute replacement with Unicode whitespace in stored names | Splitting the old names left attributes behind | Delete exact keys; reassigning the element's own live view preserves values and callback edits |
| Child/descendant selector lists in a different clause order | A later relative clause failed, and splitting could discard document roots | Scan top-level clauses iteratively, retain original roots and use the kernel's traversal order |

Native crash reproducers run in isolated main-thread and caller-managed worker
processes. Boundary, malformed-string, escape/comment, cache-reset and recovery
checks cover HTML/XML and both execution modes. A direct kernel regression also
verifies the bound independently of facade preprocessing. The list cases include
overlapping/template roots, pending writes, malformed branches and long flat
lists. Installed packages and portable browser paths repeat the corrected public
behavior; the [stack diagnostic](stack.md) checks the added parser bound.

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
| Shared `attribs` replacement object | Nodes can share the assigned JavaScript object | Copies values into each node's document storage; external object changes are not DOM mutations |
| Context-returning `:scope` lists or mixed sibling/absolute lists | Some results depend on the first clause | Best-effort subset; the clause-order fix covers child/descendant lists |
| Self-replacement and repeated insertion references | Can delete a preceding neighbor or duplicate one physical node in child arrays | Preserves unaffected neighbors, one physical node and reciprocal links |
| Generic raw properties on text/comments | Ordinary property getter is element-only | Existing NodeHandle fields remain readable as a GroveDOM extension |
| Derived property setters and `.val(callback)` | Not equivalent DOM setter/callback operations | Retained GroveDOM conveniences; arbitrary domhandler tree writes are unsupported |

Parser recovery beyond the targeted select modes and the other documented
unsupported APIs remain best-effort. These changes do not claim complete
Cheerio equivalence.

The initial source audit had no elapsed-time benchmark. Follow-up timing and
profiling are recorded separately in [benchmarks](benchmarks.md); historical
adoption ratios are not measurements of these fixes.
