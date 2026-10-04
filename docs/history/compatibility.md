# Cheerio compatibility

The reference is Cheerio **1.2.0**, using its default parse5 HTML configuration. This inventory describes the implemented public surface, not blanket parity for every input or overload. Successful output, ownership and existing workload performance are required; exact invalid-input errors are not a gate. Runtime code does not import Cheerio or fall back to another mutable DOM.

## Package and loading

| API | Status |
|---|---|
| `load(string, options?, isDocument?)` | HTML and XML, including HTML templates/fragments, XML SVG/sitemaps, `scriptingEnabled` and `baseURI` |
| `load(Buffer, ...)` | Implemented with UTF-8 decoding, matching Cheerio's `load` overload |
| `contains`, `merge` exports | Implemented; `merge` reuses Cheerio's generic declaration |
| Callable `$`, selector/context and markup inputs | Implemented for the supported selector grammar and document-owned handles |
| `$.html`, `$.xml`, `$.text`, `$.root`, `$.contains`, `$.merge`, `$.parseHTML`, `$.extract`, `$.load` | Implemented; `$.html` accepts the audited per-call serializer options below |
| `loadBuffer` | Deferred: encoding sniffing differs from UTF-8 `load(Buffer)` |
| `stringStream`, `decodeStream`, `fromURL` | Deferred: incremental parsing/decoding and network ownership need a separate loading design; no whole-input buffering shim is presented as equivalent streaming support |
| XML parser options | `xml: true`, `xmlMode: true`, and the audited `xml` option object below |
| Raw domhandler input to `load` and cross-document adoption | Unsupported; handles stay owned by their creating document |
| `$.fn` plugins, custom pseudos and parser tree adapters | Unsupported compatibility contracts |

`execution: 'direct' | 'buffered'`, `flush()` and idempotent `dispose()` are GroveDOM additions. Explicit disposal remains the primary lifecycle; the existing native/Wasm GC fallbacks are unchanged. Node.js 22 or newer is required.

## Selections

| Area | Implemented names |
|---|---|
| Collections | `get`, `toArray`, `eq`, `first`, `last`, `slice`, `splice`, `each`, `map`, `end`, iteration, indexing, `length`, `cheerio` marker |
| Traversal | `find`, `children`, `contents`, `parent`, `parents`, `parentsUntil`, `closest`, `siblings`, `next`, `prev`, `nextAll`, `prevAll`, `nextUntil`, `prevUntil` |
| Filtering | `filter`, `not`, `is`, `has`, `add`, `addBack`, `index` |
| Attributes/properties | `attr`, `removeAttr`, `prop`, `data`, `css`, `val`, `hasClass`, `addClass`, `removeClass`, `toggleClass` |
| Mutation | `append`, `prepend`, `before`, `after`, `appendTo`, `prependTo`, `insertBefore`, `insertAfter`, `remove`, `empty`, `clone`, `replaceWith`, `wrap`, `wrapAll`, `wrapInner`, `unwrap` |
| Output | `html`, `text`, `toString`, `serialize`, `serializeArray`, `extract` |

These names cover Cheerio's documented selection methods. Its internal `filterArray`, `_parse`, `_render` and other implementation helpers are not a supported public contract. GroveDOM additionally provides `detach` and `removeData`.

`insertBefore` and `insertAfter` return cloned inserted nodes, as Cheerio does; retained original handles remain detached. `appendTo` and `prependTo` preserve the original nodes for the final target. Selection membership edits do not mutate the document, and earlier snapshots retain their original membership.

Common property reads/writes and attribute-map replacement are implemented. Arbitrary namespace changes, writable live child arrays, arbitrary domhandler fields and every property combination are not supported. Handles expose stable identity, relatives, character data and live attributes; their TypeScript declarations deliberately describe GroveDOM handles rather than claiming complete domhandler compatibility.

## Selectors and templates

Ordinary CSS uses Lexbor. Common trailing positional pseudos are supported: `first`, `last`, `eq`, `nth`, `lt`, `gt`, `even`, `odd`. Common `:contains`, `:input`, `:header`, `:button`, `:text`, `:selected`, `:parent`, and input-type aliases are also implemented. These compose with ordinary CSS, `:has`, `:not`, `:is` and `:where`. Positional pseudos are not a general nested selection engine.

Leading `>`, `+`, `~` and `:scope` queries support compound selectors and subsequent traversal steps, including quoted attribute values and nested CSS arguments. Relative filtering with `filter`/`is`, mixed child/sibling relative lists and arbitrary placements of `:scope` remain unsupported. The relative path is separate from ordinary CSS queries.

Template content is an owned fragment child exposed by `contents()`. Global and fragment-root queries can visit it. Queries scoped entirely to elements stop at fragment boundaries, matching Cheerio; this applies to `main.find(...)` as well as direct `template.find(...)`. Use `template.contents().find(...)` for content. Parent traversal and selector ancestry stop at the fragment, while raw parent links and `contains` retain the connection.

CSS `:has` and `:empty` work on template documents, including nested occurrences and retained detached templates. `:has` can discover descendants through fragments while selector ancestry between components stops at a fragment. `:empty` ignores a fragment child and a zero-length text child, while nonempty XML CDATA makes the element nonempty. Empty-text matching uses the compatibility evaluator on ordinary documents too. Compatibility evaluation limits selector nesting to 64 levels and fails explicitly beyond that; DOM depth does not consume recursive selector stack. Other ordinary Lexbor plans retain their existing evaluator. Getters preserve template structure; they do not reproduce Cheerio's incidental HTML-getter mutation of its child array. Empty-template serialization produces valid empty HTML rather than reproducing Cheerio's serialization exception.

`.text('')` preserves an observable empty text child, including paired XML tags;
`.empty()` removes all children. Insertion under the HTML element uses ordinary
mutation fragments, while `.html()` replacement retains its HTML-element parsing
context and resulting head/body wrappers. These distinctions are covered by
differential regressions discovered through seeded mutation fuzzing.

## XML, SVG and sitemaps

Use `load(source, { xml: true })` or `{ xmlMode: true }` for XML. HTML parsing of inline SVG remains separate. Both Node-API and every Wasm heap mode use the same XML implementation and explicit disposal contract.

```js
const $ = load(source, { xml: true });
try {
  $('loc').text((index, url) => url.replace('https://example.test/', './'));
  return $.xml();
} finally {
  $.dispose();
}
```

Element and attribute spelling is case-sensitive, including SVG `viewBox` and `linearGradient`. Qualified names and namespace declaration attributes are preserved. Query qualified names with CSS escapes, such as `$('image\\:loc')` or `$('[xlink\\:href]')`; CSS namespace bindings and namespace-URI resolution are not implemented.

The parser handles multiple top-level nodes, text, predefined/numeric entities, comments, processing instructions/XML declarations, DOCTYPE and CDATA. CDATA exposes a text child, matching Cheerio's node shape. The same XML parser handles markup construction and fragment mutations, and cloning preserves qualified names and retained-node identity. XML attribute/property reads do not apply HTML boolean normalization. `html()` and `toString()` serialize XML when the owner was loaded in XML mode; `$.xml()` also provides XML output for HTML documents. One existing spelling difference is `text('')`: GroveDOM clears the children and can emit `<item/>`, while Cheerio retains an empty text child and emits `<item></item>`.

The `xml` option object reuses the compatible subset of Cheerio's public options: `decodeEntities`, `lowerCaseTags`, `lowerCaseAttributeNames`, `selfClosingTags`, `emptyAttrs`, `encodeEntities`, `recognizeSelfClosing`, `recognizeCDATA`, and `xmlMode: true`. As in Cheerio XML mode, empty attributes keep `=""`, CDATA and self-closing input are recognized, and `encodeEntities: 'utf8'` still uses XML entity encoding. `decodeEntities: false` preserves input entities and defaults to raw output; an explicit `encodeEntities` overrides that output choice. Unknown callbacks/options and nested `xmlMode: false` fail explicitly. Parser defaults are configured at load time. `$.html(options)` and `$.html(nodes, options)` also accept `xml`, `xmlMode`, `encodeEntities`, `decodeEntities`, `selfClosingTags` and `emptyAttrs` for an individual render. HTML uses parse5-compatible output; XML output reuses the existing serializer. Calls preserve owner defaults and Cheerio's nested XML-option precedence. Selection arguments retain their own rendering options, matching Cheerio. Unknown render options fail explicitly.

This is not a validating XML processor. It never fetches external resources or expands DTD entities; unknown entities remain literal text and are escaped on output. Internal DOCTYPE subsets are preserved as one declaration, improving on htmlparser2's early termination at an embedded `>`. Open elements at EOF and unquoted/bare attributes are accepted for practical Cheerio compatibility; other malformed recovery and XML error text are not promised. The parser does not implement encoding sniffing, DTD validation, full XML-name validation, or XML-specified line-ending/attribute normalization. Inputs use the same UTF-8 string/Buffer contract as the HTML facade.

## Evidence and remaining gate

The imported selection includes all six Cheerio API suites above, static contains/merge cases, and selected jQuery cases: **618 cases, 607 active and 11 documented exclusions**. Authored tests add XML/SVG/sitemap behavior, template ownership, snapshot identity, relative queries, escaping, disposal, caller-managed workers and Wasm heap modes. See the [test selection](../../test/upstream/selection.json) and [prototype verification](prototype.md#verification-and-diagnostics).

The isolated engine adapter and actual engine/MDN transforms now have a deterministic replay: seven authored scenarios and eight saved MDN pages match Cheerio output and ordered resource events on native and every Wasm heap mode. Cross-document node adoption remains deferred because the audited consumers exchange strings or separate resources. See [integration scope and commands](integration.md). This does not establish complete pipeline/plugin or consumer TypeScript compatibility. The full ≥3× performance gate and sustained memory/fragmentation budgets remain open; see the [benchmark evidence](benchmarks.md).
