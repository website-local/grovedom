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
| Balanced generated corpus | 48 seeded HTML/XML/SVG inputs covering width, depth, Unicode, long values, namespaces, malformed input, templates, forms and retained selections |

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
available, then open `test/browser-correctness.html?wasm=../assets/grovedom.wasm`.
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
XML serializer tests cover entities, doctype identifiers and quote framing when
entity encoding is disabled. Long names and values cross output-buffer boundaries
while checking per-call options, selection output and retained strings in both
execution modes. Dependency-patch tests reject modified inputs, patches and
cached trees, and ensure preparation does not modify the supplied upstream source.

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
then verify retry, a second live owner and disposal. Four additional XML-output
sweeps cover 14 failed growth requests across HTML/XML owners with encoded/raw
attribute values, checking exact retry output and complete disposal. This does
not test every upstream allocation or establish universal out-of-memory recovery.

The raw-attribute quote correction passes a 1,870-case suite on Node 22/24:
native has 1,811 passes and 59 exclusions, pooled Wasm 1,819 and 51. Native
sanitizers, other Wasm heaps, workers, portable browser checks, types, both
193-case consumer snapshots, the broader corpus, seeded fuzzing and all four
120-cycle authored memory budgets also pass. These correctness and resource
checks do not establish an elapsed performance improvement.

Saved-input checks cover 174 inputs; all 193 pipeline cases match each preserved
installed/development consumer snapshot on native and Wasm. The snapshots are
historical, not a claim about every subsequent downloader revision. Use
[short performance checks](benchmarks.md) when a runtime change warrants them;
adding correctness fixtures alone does not require another benchmark campaign.

## Broader corpus follow-up

The [balanced fixture generator](../bench/balanced-fixtures.mjs) adds sixteen
families in each of HTML, XML and SVG, with fixed seeds. Its
[workload](../bench/corpus-workload.mjs) checks whole-document serialization,
27 selectors, raw attributes and relations, traversal, callback observations,
seeded edits, retained snapshots and disposal. Four deliberately malformed
XML/SVG inputs check rejection and lifecycle safety separately from successful
output comparisons. They are not successful-output passes.

A separate private convenience sample preserves 48 public HTTP responses from
50 fixed requests, including redirects and error/challenge bodies; two transport
failures were recorded without replacement requests. The sample includes no MDN
pages. The original bodies and headers remain separate from decoded inputs, and
one duplicate body pair is retained. This is additional coverage, not a random
web sample or a validated production distribution.

The offline [corpus checker](../bench/check-corpus.mjs) takes a local manifest
with an `entries` array. Each entry supplies `id`, `group`, `mode` (`html`, `xml`
or `svg`), a relative UTF-8 `file`, its `sha256`, and a deterministic `seed` or
explicit `operations`. It fetches nothing:

```sh
node --expose-gc bench/check-corpus.mjs \
  --manifest=./build/corpus/manifest.json --out=./build/corpus/report.json
```

Developer backend/heap settings apply as described in [setup](prototype.md).
The report preserves phase hashes, mismatches, exceptions and lifecycle counters;
any mismatch or exception returns exit status 2. The 96-case follow-up has
**92 exact matches and four explicit malformed-input rejections** on native,
all three Wasm heap modes and the portable browser entry under Node. Native
sanitizer checks cover the same inputs. Direct-mode replays are checked separately.
Private downloaded inputs and reports are not shipped with the package.

The corpus exposed structural selectors counting non-element siblings and
template queries discarding explicit roots across fragment boundaries. Reduced
tests reproduce both defects before their fixes. Until-traversal tests also
preserve repeated stop-callback visits and indices, filter the visit stream
before deduplication/sorting, and return the original selection from `end()`.

The two historical optimization trials qualified up to 1,865 cases on Node 22/24:
native 1,806 pass / 59 skip, pooled Wasm 1,814 / 51, with no unexpected failures.
Native ASan/UBSan/leak checks, owned-output allocation failures, 200 seeded cases
per backend, browser normal/fallback checks, types, both 193-case consumer
snapshots and all four authored memory budgets pass. Custom-corpus lifecycle
runs remain separate and disable those authored budgets. The experiments were
not promoted; their [timing outcomes](history/performance-review.md#broader-corpus-and-historical-lead-trials)
do not establish performance acceptance. The corrected baseline is preserved
with focused checks after restoring its runtime code.

The restored reference also matches all eight original workload outputs against
Cheerio on native, pooled Wasm and the browser entry under Node. After two
inconclusive timing prerequisites, a fresh [reserved-window confirmation](history/performance-review.md#reserved-window-confirmation)
attempts all twenty panels and still lacks full performance acceptance. Its
untimed follow-up verifies exact before/candidate outputs on the two failed
workloads; this is not a new full correctness matrix. Successful correctness
checks do not satisfy the timing gate or establish browser-engine coverage.

The later selected runtime keeps the HTML span writer only for Wasm and restores
the preceding native writer and standard XML-name comparison. Its 1,866-case
matrix passes on Node 22 and 24: native **1,807 pass /59 skip**, pooled Wasm
**1,815 /51**. The additional case versus the earlier 1,865-case checkpoint
checks transitive benchmark-control isolation. Native ASan/UBSan/leak and owned
output-failure checks, both 193-case consumer snapshots on both backends,
200 seeded cases per backend, browser normal/fallback and type checks pass.
The broader corpus again has 92 exact matches and four explicit malformed
rejections across native, all Wasm heap modes and the portable entry.
All four authored memory budgets pass; separate custom-corpus lifecycle checks
continue to disable those fixed budgets. The retained Wasm writer's body is
unchanged from its preceding native sanitizer qualification; the current native
sanitizer run exercises the restored native path. These correctness results do
not supply performance acceptance. The separate [writer timing check](history/performance-review.md#selected-writer-on-the-broader-corpus)
completes its seeded-input panel; real-page timing remains incomplete after a
resource stop.

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
