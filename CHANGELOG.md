# Changelog

## 0.1.1 (unreleased)

**Non-breaking patch for the supported 0.1.0 API.** Import paths, exported
functions, TypeScript signatures, initialization options, Node requirements,
platform support and document ownership rules are unchanged. No application
migration is required for that contract. Deliberate incompatible changes during
0.1 development will use 0.2.0 rather than a patch version.

### Fixes

- Correct scoped and nested selectors, element sibling positions, template query
  roots, Unicode comparisons, select parsing and foreign-content serialization.
- Preserve callback order, selection snapshots, traversal filtering and context
  chains; align attributes, data caches, class operations and forms with the
  documented Cheerio behavior.
- Keep double quotes escaped in raw XML attributes and avoid excessive rescanning
  or stack growth in long positional selector chains.
- Verify tarball bytes, versions and commit identity before offline installation
  tests; exercise the installed public APIs, XML, callbacks, disposal and workers.
- Reject invalid benchmark timings and ambiguous case lists; add deterministic
  workload, lifecycle, direct-mode corpus and comparison-statistics regressions.

These fixes can change results that depended on earlier bugs. In particular,
attribute callbacks returning undefined now store the string "undefined" like
Cheerio; data attributes are cached per requested key, and explicit data keys
retain their spelling. Raw XML attributes escape quotes even when entity encoding
is disabled. See the
[compatibility guide](docs/compatibility.md) for remaining differences.

### Performance

The Wasm HTML opening-tag writer has scoped HTML and seeded-corpus improvements.
Native retains its previous writer. Later unqualified optimization trials are
excluded. CI diagnostics and isolated results are documented in
[performance evidence](docs/benchmarks.md); full-workload adoption and universal
non-regression remain unverified.

### Release scope

Both packages remain experimental. Browser-engine testing is still pending;
portable browser checks run under Node. The native package remains Linux x64 with
glibc 2.35 or later. Publication uses freshly built artifacts through the existing
manual release workflow after all verification jobs pass.

## 0.1.0

Initial experimental Wasm and native packages, with the shared browser entry,
standalone declarations and explicit document disposal. Published artifacts and
the release tag remain immutable.
