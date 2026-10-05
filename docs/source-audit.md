# Source compatibility audit

This audit pairs upstream implementation branches with small differential
reproducers beyond the saved MDN workload. It does not establish complete
Cheerio compatibility. No dependency update or additional Lexbor patch was
required for the fixes below.

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
| Text/metadata | `innerText` crossed fragment roots; doctype data absent | domutils root/template rules and parse5-adapter doctype name/data |
| XML references | Numeric C1 references decoded literally | htmlparser2/entities mapping, including `&#x80;` to `€`; literal controls unchanged |
| Styles/wrapping | Continuation whitespace lost; null CSS callback stringified; wrapper callbacks skipped | Cheerio's observed values and mixed-node callback order |

The imported jQuery class-whitespace case and WPT fragment `:root` case retain
their original assertions as explicit exclusions because they differ from
Cheerio. Exclusions do not count as passes.

## Remaining differences

These are confirmed limits. Cartesian probes repeat some differences across
operators, flags and document modes; they are not independent defect counts.

| Reproducer | Cheerio | GroveDOM / status |
|---|---|---|
| `<p data-x="É">`, `[data-x="é" i]` | JavaScript Unicode case rules match | ASCII case folding; broader Unicode matching is best-effort |
| `<p class="a&#160;b">`, `.b` or `[class~="b"]` | JavaScript whitespace separates tokens | CSS ASCII whitespace; differs from class **methods** above; best-effort |
| Empty attribute, `[data-x~=""]` | Can match through css-select's regular expression | Does not match, following CSS; best-effort Cheerio parity |
| Two selected nodes cloned together | Hidden shared domhandler root affects sibling/structural selectors | Independent cloned roots; container/sibling parity is best-effort |
| `$('select').html('<b>x</b>')` | parse5's `IN_SELECT` mode discards `b` | Pinned Lexbor retains it in its newer body-mode path; parser-version/recovery gap |
| `.html(callback)`, `.toggleClass()` / boolean argument | Not equivalent callback/toggle operations in Cheerio 1.2.0 | Existing GroveDOM convenience behavior; avoid for exact parity |
| `.val(array)` on single select or checkbox | Select unchanged; checkbox value assigned | Existing GroveDOM selection/checked-state behavior; avoid for exact parity |

The earlier literal U+00A0/U+2003 CSS identifier failures also remain. Prioritize
consumer cases and define Unicode/clone-container contracts before adding
compatibility machinery to common selector paths.

No elapsed-time benchmark was run for this audit. Prior scoped performance
results remain historical evidence, not measurements of these fixes.
