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

The quality checkpoint has 1,759 cases: native 1,700 pass / 59 skip; pooled Wasm
1,708 / 51, with no TODOs or unexpected failures. Skips are never counted as
passes. Exact malformed-XML recovery, jQuery's empty-set `html()` result and
browser `:enabled` semantics remain explicitly different from the Cheerio contract.

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

The [source-driven audit](source-audit.md) adds callback/coercion, lazy data,
class spacing, form/link pseudo, traversal ordering, fragment-root, doctype and
XML numeric-reference regressions. Unicode/operator and token tests cover
word-sized boundaries in HTML and XML. The former Unicode identifier TODOs are
resolved; Cheerio/browser policy exclusions retain their upstream expectations.
Insertion tests distinguish default-template parsing for append/prepend/siblings
from destination-context parsing for `html(value)`, including selects, tables,
SVG and MathML. Command-buffer tests check truncated headers, overflow-shaped
lengths, typed-array view bounds, invalid IDs, partial effects and owner recovery.

Native ASan/UBSan with leak detection passes the full suite. Owned-buffer failure
checks recreate the document for every allocation countdown, exercising later
node/result/serialization/Unicode growth failures after earlier allocations
succeed. Four HTML/XML query/serialization sweeps cover 28 failed growth requests,
then verify retry, a second live owner and disposal. This does not test every
upstream allocation or establish universal out-of-memory recovery.

Saved-input checks cover 174 inputs; all 193 pipeline cases match each preserved
installed/development consumer snapshot on native and Wasm. The snapshots are
historical, not a claim about every subsequent downloader revision. Use
[short performance checks](benchmarks.md) when a runtime change warrants them;
adding correctness fixtures alone does not require another benchmark campaign.

## Seeded fuzzing

`test/fuzz.mjs` separates deterministic generation and execution in `test/fuzz/`.
Each valid case compares both buffered and direct execution with Cheerio, including
multi-node callbacks, deliberate callback exceptions, queued writes, retained
selection membership and observations after later edits. An independent traversal
checks acyclic, reciprocal parent/sibling links and stable child identity.
HTML/XML, foreign content, select and template cases are included by default.
Every ninth generated input is corrupted for safety checks; successful parses
must retain tree invariants, and rejected inputs must leave subsequent documents
usable. Malformed recovery is not compared with Cheerio.

Set `TMPDIR` and `GROVEDOM_FUZZ_DIR` to disk-backed output directories, then run
`npm run test:fuzz`. Developer options are:

| Option | Behavior |
|---|---|
| `GROVEDOM_FUZZ_SEED` | Unsigned 32-bit seed; invalid values fail explicitly |
| `GROVEDOM_FUZZ_CASES` | Positive case count; default 1,000 |
| `GROVEDOM_FUZZ_MALFORMED=0` / `1` | Force differential-only / malformed-safety cases |
| `GROVEDOM_FUZZ_TEMPLATES=1` | Include templates in every HTML case |
| `GROVEDOM_FUZZ_CASE_FILE` | Replay one saved input, independently of generator state |

The runner saves `active.json` before each case and `stage.json` before each
phase/operation, so crashes leave a reproducer. Ordinary failures also save a
named case and, for differences, full actual/expected observations. Reports
separate requested actions from those that matched nodes, as well as safety
cases, accepted/rejected executions and live-document/allocation counts. Older
unversioned case files remain replayable. These are bounded seeded checks, not
coverage-guided fuzzing or proof that arbitrary inputs are safe.

CI keeps the existing 200-case native/Wasm fuzz checks and adds 64 cases to the
existing sanitizer job. Failing runs upload their reproducer directory; no new
runner job or benchmark is added.

[GitHub CI](releasing.md) also runs release-policy and artifact-integrity tests,
including simulated npm failures that must produce no publication. Those tests
use a local fake npm executable and require no credentials or registry access.
Mock CLI and synthetic CI subprocesses do not inherit `LD_PRELOAD`: they load no
native addon, and sanitizer reports from their Node runtime can overflow captured
output on deliberate failures. Native DOM, lifecycle and worker tests retain
ASan/UBSan and leak detection. Owned-buffer fault checks run even if the preceding
suite fails, provided the sanitizer build succeeded.
