# Web Platform Tests subset

These fixtures derive from [Web Platform Tests](https://github.com/web-platform-tests/wpt/tree/564b9b1eb1387ef42456f1cba77d2d38599fad61)
under the accompanying [BSD-3-Clause license](LICENSE.md). `sources.json` pins
the revision and SHA-256 hashes. Regenerate the data offline with:

```sh
node scripts/import-web-platform-tests.mjs /path/to/pinned/wpt
```

All 207 records from `dom/nodes/selectors.js`'s `validSelectors` array are
retained, including exclusions. Expected IDs and tree order are unchanged.
Eligible cases run as document, element, detached-element and fragment queries,
respecting upstream context exclusions. Repeated queries also check identity and
uniqueness. `selectors.html` is the original HTML fixture. Arbitrary namespace
creation, XHTML fixtures, URL/history/language selectors, pseudo-elements,
shadow DOM and browser-specific CSS error recovery are outside this selection.

All 68 top-level escape cases from `ParentNode-querySelector-escapes.html` are
retained. Two cannot represent their lone UTF-16 surrogate IDs through a UTF-8
DOM and skip explicitly. Literal U+00A0/U+2003 identifier cases now pass;
NBSP acceptance is a useful extension beyond css-what. Escaped forms also pass.

`dom-cases.mjs` adapts 28 additional cases from these files at the same revision:

- `dom/nodes/ParentNode-querySelector-All.js`: static selection membership.
- `dom/nodes/ParentNode-querySelector-dupe-id.html`: clone identity and scope.
- `dom/nodes/ParentNode-querySelectorAll-case-insensitive-attribute-flag.html`:
  uppercase and lowercase attribute case flags.
- `html/syntax/parsing/cdata-in-integration-point-fragment.html`: HTML, SVG and
  MathML fragment contexts, with and without a preceding text token.
- `html/syntax/parsing/adoption_agency_check_the_end_tag_name.html`: preserve
  properly nested formatting elements during fragment construction.

Browser node creation and `innerHTML` operations map to GroveDOM construction
and `.html()`; fixed expected text, node types and identities stay intact. These
28 cases run in both buffered and direct execution. No browser scripts, external
resources, layout, events or live DOM property state are emulated.

The resulting suite has 845 cases: 810 pass, 35 explicitly skip and no TODOs.
The empty-token selector record is excluded because Cheerio regex semantics
differ from browser CSS; compatibility-gaps regressions cover it separately. One selector exclusion preserves Cheerio's broad `:enabled`
semantics; a separate compatibility regression records the difference.
Scoped `find` follows Cheerio's ancestry boundary. WPT record 160 retains its
original expected IDs and runs in document scope; its element context skips
explicitly because browser `querySelectorAll` permits ancestors outside the query
root. The scoped-selector regressions check the Cheerio behavior separately.
Successful foreign-context CDATA cases follow WPT even where current Cheerio/parse5 differs.
This is selected coverage, not full WPT conformance or browser certification.

Node uses `../web-platform.test.mjs`. The browser page and Node's browser sandbox
share the same runners and expectations; see [running tests](../../docs/testing.md).

Record 74 retains its empty expected IDs. Only its fragment context skips:
Cheerio `:root` matches fragment children, unlike browser fragment queries.
The other contexts and source-parity regressions remain active.
