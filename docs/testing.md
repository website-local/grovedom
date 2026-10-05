# Correctness tests

`npm test` runs deterministic Node tests against the backend selected by the
developer-only configuration in [setup](prototype.md). No network, browsers or
benchmark timings are needed for the unit suite. Every loaded document is
disposed after its case, including failures.

| Source | What is checked |
|---|---|
| Cheerio 1.2.0 | Attributes, traversal, mutation, forms, CSS, extraction, static helpers and loading; fixed parser trees and differential API behavior |
| jQuery 3.7.1 | Selected whitespace/class, fragment insertion, mixed content and callback-index regressions |
| WPT / DOM, HTML and CSS standards | Selector order/scope/identity, escapes, static snapshots, duplicate IDs, foreign fragment CDATA and formatting-element parsing |
| GroveDOM regressions | Buffered observations, callbacks, handles/disposal, worker ownership, Wasm growth/pools, options, faults and standalone declarations |

[Cheerio/jQuery selection](../test/upstream/README.md) and
[WPT selection](../test/web-platform/README.md) identify exact sources, licenses,
adaptations and exclusions. Imported WPT expectations are fixed upstream data;
they are not calculated by GroveDOM or Cheerio during the run. Parser assertions
also check reciprocal parent/sibling links and stable handle identity.

The hardening checkpoint has 1,611 cases. Pooled Wasm passes 1,564, skips 45 and
executes two known selector failures as TODOs. Native passes 1,558 with 51 skips
and the same two TODOs; extra skips concern backend/heap-specific cases. Skips
and TODOs are never reported as passes. Exact malformed-XML recovery, jQuery's
empty-set `html()` result and browser `:enabled` semantics remain explicitly
different from the supported Cheerio contract.

## Browser entry

`test/browser-correctness.html` runs the same 845 WPT-derived cases through async
browser initialization. Serve the workspace over HTTP with the Wasm file also
available, then open `/test/browser-correctness.html?wasm=/path/grovedom.wasm`.
The URL must satisfy browser CORS rules. The local server accepts `.mjs` and JSON:

```sh
node scripts/serve-demo.mjs . 8080
```

The page reports passes, unexpected failures, exclusions and known failures
separately. It performs no benchmark or CDN request. A resolved known failure
requires review rather than silently passing under an old exemption.

For a portable module-graph check without a browser engine:

```sh
node --experimental-vm-modules test/browser-sandbox.mjs
GROVEDOM_BROWSER_FALLBACK=1 node --experimental-vm-modules test/browser-sandbox.mjs
```

These checks run under Node without Node globals in the browser module context.
They do not establish Chromium, Firefox or WebKit support; those remain
best-effort until the page is executed in actual engines.

## Additional checks

`npm run test:types` and `scripts/check-package-types.mjs` cover declarations,
including isolated consumers without Cheerio. `npm run test:fuzz` uses explicit
seeds and disk-backed reproducers. Sanitizer and owned-buffer failure checks are
described in [setup](prototype.md). Keep raw reports and local paths outside Git.
Foreign-content regressions compare Cheerio's HTML and XML modes across namespace
collisions, attribute removal/reinsertion, cloning, renaming and serialization.
Ancestor-selector tests check backtracking through nested list pseudo-classes;
XML serializer tests cover entities and doctype identifiers. Dependency-patch
tests reject modified inputs, patches and cached trees, and ensure preparation
does not modify the supplied upstream source.

The gap follow-up has 1,750 cases: native 1,691 pass / 59 skip; pooled Wasm
1,699 / 51, with no TODOs or unexpected failures. Further differential
regressions cover ASCII/Unicode boundaries across all six attribute operators,
partial tokens, near-whitespace characters and word-sized scan boundaries in
HTML and XML; the full native sanitizer suite passes too. The empty-token WPT
record is an explicit Cheerio/browser policy exclusion; the two Unicode identifier TODOs
are resolved. Native ASan/UBSan with leak detection and the new Unicode-buffer
allocation-failure regression pass. Saved-input checks cover 174 inputs; all
193 pipeline cases match each preserved installed/development consumer snapshot
on native and Wasm. The source snapshots are historical, not a claim about
every subsequent downloader revision.

The [source-driven audit](source-audit.md) adds callback/coercion, lazy data,
class spacing, form/link pseudo, traversal ordering, fragment-root, doctype and
XML numeric-reference regressions. Its Node 22 suite has 1,735 cases: native
1,675 pass / 58 skip / 2 TODO; pooled Wasm 1,683 / 50 / 2, with no unexpected
failures. The additional jQuery class-whitespace and WPT fragment-root exclusions
record Cheerio/browser differences; upstream expectations remain unchanged.
Scoped-selector regressions check ancestry bounds, overlapping contexts, nested
`:has()` predicates and the deliberate difference from browser query scoping.
Tag-predicate tests cover snapshots, buffered mutations, renaming, disposal,
HTML/XML case rules and positional-selector fallbacks. The follow-up local
Node 22/24 suites contain 1,715 cases with no unexpected failures; native
sanitizers, shared/fresh Wasm checks and 500 seeded fuzz cases also pass.
Use [short performance checks](benchmarks.md) only when a runtime change warrants
them; adding correctness fixtures does not require another benchmark campaign.

[GitHub CI](releasing.md) also runs release-policy and artifact-integrity tests,
including simulated npm failures that must produce no publication. Those tests
use a local fake npm executable and require no credentials or registry access.
Mock CLI and synthetic CI subprocesses do not inherit `LD_PRELOAD`: they load no
native addon, and sanitizer reports from their Node runtime can overflow captured
output on deliberate failures. Native DOM, lifecycle and worker tests retain
ASan/UBSan and leak detection. Owned-buffer fault checks run even if the preceding
suite fails, provided the sanitizer build succeeded.
