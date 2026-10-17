# Changelog

## 0.1.1

Released 2026-10-17.

**Compatibility bug-fix release for the documented 0.1.0 surface.** Import paths,
exported functions, initialization options, Node requirements, platform support
and document ownership rules are unchanged. Corrected results and extraction
type inference can require adjustments in code that relied on earlier bugs;
the changes are listed below. Deliberate incompatible API changes during 0.1
development will use 0.2.0 rather than a patch version.

### Fixes

- Correct scoped and nested selectors, element sibling positions, template query
  roots, Unicode comparisons, select parsing and foreign-content serialization.
- Preserve callback order, selection snapshots, traversal filtering and context
  chains; align attributes, data caches, class operations and forms with the
  documented Cheerio behavior.
- Keep double quotes escaped in raw XML attributes and avoid excessive rescanning
  or stack growth in long positional selector chains.
- Preserve property/CSS map observations in element/key order, raw property
  callback values, node-based `find().end()` context and existing-node identity
  across multiple `replaceWith` targets.
- Implement the declared property relation aliases and reject direct writes to
  read-only node types/relations instead of silently creating attributes.
- Flatten array-extraction callback results by one level, including inherited
  enumerable descriptors; correct the corresponding TypeScript result inference.
- Align ordinary form-value setters and XML `multiple` truthiness with Cheerio;
  distinguish escaped identifier colons from positional filters and explicitly
  reject unsupported positional selector lists.
- Preserve individual duplicate occurrences in `not(callback)`, capture extraction
  descriptor getters before querying, and respect case-sensitive XML form types.
- Preserve match order and scope across overlapping template query roots, including
  explicit content roots and allocation-failure recovery.
- Reject CSS block/function nesting above 512 before parsing, preventing native
  selector-cleanup crashes and preserving the first valid query after rejection.
- Replace attributes by their exact stored names, including Unicode whitespace;
  preserve attributes and callback edits when reassigning an element's own live view.
- Handle child/descendant selector lists in either clause order, retaining document
  and template roots, disjoint-root order, escaped delimiters and selection snapshots.
- Order those lists without creating handles for unrelated descendants, so removed
  unobserved subtrees can be reclaimed during the document lifetime.
- Preserve newly assigned attribute spelling, including SVG `viewBox` and distinct
  uppercase/lowercase `id` and `class` keys, through cloning and serialization.
- Run insertion callbacks on document/template roots and honor callback-first
  overloads with additional arguments, preserving indices and partial effects.
- Replace raw element data stores and existing `prop('data')` stores by reference;
  retain attribute-backed properties before a data store exists.
- Reuse node kind for repeated raw data assignments while preserving pending-write
  observations before value coercion and disposal checks.
- Ignore CSS comments during selector alias expansion and skip script/style
  containers when choosing `wrapAll` insertion targets.
- Verify tarball bytes, versions and commit identity before offline installation
  tests; exercise the installed public APIs, XML, callbacks, disposal and workers.
- Check older Pages releases with their tagged test fixtures, keeping historical
  expectations separate from corrections in newer packages.
- Reject invalid benchmark timings and ambiguous case lists; add deterministic
  workload, lifecycle, direct-mode corpus and comparison-statistics regressions.
- Prevent GitHub publication after cancellation or skipped requested npm jobs;
  check existing npm tags before publishing and correct resumed draft prerelease
  status.
- Fix local demo routing so the printed URL loads its benchmark modules.
- Ship separate Wasm and native package READMEs with runnable examples, asset
  setup, disposal rules, platform requirements and compatibility limits.

These fixes can change results that depended on earlier bugs. In particular,
attribute and ordinary property callbacks returning undefined now store the string
"undefined" like Cheerio; ordinary null properties stringify to "null". Data
attributes are cached per requested key, and explicit data keys retain their
spelling. Array extraction turns a callback result `[1, 2]` into two list entries
instead of one nested array; null/undefined inside returned arrays are retained,
while scalar null/undefined results are omitted. Its inferred list type follows
that behavior. Raw XML attributes escape quotes even when entity encoding is
disabled. See the
[compatibility guide](docs/compatibility.md) for remaining differences.

### Performance

The Wasm HTML opening-tag writer has scoped HTML and seeded-corpus improvements.
Native retains its previous writer. Later unqualified optimization trials are
excluded. CI diagnostics and isolated results are documented in
[performance evidence](docs/benchmarks.md); full-workload adoption and universal
non-regression remain unverified.

### Release scope

Both packages remain experimental. Reported Firefox 150 and Chromium 140
[demo measurements](docs/benchmarks.md#011-release-measurements) cover the authored
workloads; a full browser correctness matrix remains pending. Portable browser
checks run under Node. The native package remains Linux x64 with glibc 2.35 or
later. Publication uses freshly built artifacts through the existing manual
release workflow after all verification jobs pass.

## 0.1.0

Initial experimental Wasm and native packages, with the shared browser entry,
standalone declarations and explicit document disposal. Published artifacts and
the release tag remain immutable.
