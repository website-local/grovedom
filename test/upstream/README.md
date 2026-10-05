# Selected upstream tests

The committed JavaScript cases derive from Cheerio 1.2.0 and jQuery 3.7.1, under their accompanying MIT licenses. `selection.json` records the method groups, source files, and explicit exclusions. Public source tags:

- https://github.com/cheeriojs/cheerio/tree/v1.2.0/src/api
- https://github.com/jquery/jquery/tree/3.7.1/test/unit

`scripts/import-upstream-tests.mjs` reproduces the selection from existing source directories. Set `GROVEDOM_CHEERIO_TEST_SOURCE`, `GROVEDOM_JQUERY_TEST_SOURCE`, and `GROVEDOM_TYPESCRIPT_MODULE` to available sources/compiler module, then run it with Node. It downloads or installs nothing. Generated tests use Node's test runner; Vitest and QUnit are not dependencies.

Adaptations replace runner/imports, erase TypeScript annotations and upstream type-only assertions, supply a document-bound fixture helper, and dispose documents after each test. Runtime assertions and fixture content are preserved. The small assertion adapter compares GroveDOM node handles by identity, including inside arrays, so opaque handles cannot accidentally compare equal as empty objects. Declaration behavior is checked separately in `test/types.ts`.

The current selection contains 631 upstream cases: 617 run and 14 are explicitly skipped. All method groups from Cheerio’s attributes, traversal, manipulation, forms, CSS and extraction suites are selected, together with static contains/merge and loading cases. The jQuery selection covers 13 cases across attributes and manipulation. Exclusions cover arbitrary namespace writes, live domhandler child-array identity, invalid-input/error-specific behavior, one malformed XML loading case, and jQuery's ASCII attribute/class whitespace and empty-set HTML behavior, which differ from Cheerio. The numeric-key data test mixes valid and invalid input; ordinary data assignment has separate coverage. These exclusions are visible in test output and the manifest, and are not counted as passes. Exact invalid-input/error parity is not an adoption requirement.

The loading suite is imported intact, with its malformed XML case explicitly excluded; well-formed XML script children have a separate regression. Test-only `each`/`map` adapters support the selected jQuery callbacks. [Parser contracts](../parser-contract.test.mjs) add fixed expected trees and reciprocal parent/sibling checks based on Cheerio's parser tests. The independent [Web Platform Tests subset](../web-platform/README.md) preserves browser-standard expectations separately.

This is selected DOM coverage, not the full Cheerio or jQuery suite. Browser layout, events, script execution, streaming/network loading, plugins, and general domhandler interoperability are outside this prototype. Successful consumer behavior and measured performance remain the priorities.
