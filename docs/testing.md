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

## Current qualification

The 0.1.1 readiness hardening passes the **2,184-case suite**. Sixty new cases
cover selector nesting/recovery, exact attribute replacement and relative lists,
including installed public contracts. Earlier callback, template, snapshot and
release-workflow regressions remain enabled:

| Backend | Node versions | Pass / exclusions |
|---|---|---:|
| Native | 22, 24 | 2,125 /59 |
| Pooled Wasm | 22, 24 | 2,133 /51 |
| Global Wasm | 22 | 2,129 /55 |
| Per-document Wasm | 22 | 2,130 /54 |

Fresh native/Wasm builds and the rebuilt native ASan/UBSan binary pass their
applicable checks, with leak detection and no sanitizer findings. Owned-buffer
failure recovery, types, offline package installations on Node 22/24, 200 seeded
cases each on native/pool and 64 sanitizer fuzz cases also pass. The preceding
release checkpoint's 1,000-case fuzz runs and four authored 120-cycle memory
budgets remain separate historical qualification, not reruns of this hardening.
Portable browser normal/fallback checks each pass 810 cases with 35 exclusions,
plus the release corrections in HTML/XML and buffered/direct modes. Local checks
do not cover exact Node 22.0.0 or Windows/macOS; the [hosted matrix](releasing.md)
remains required before publication. Actual browser-engine testing remains pending.

Installed Node, browser and native packages share thirty-two public-contract checks
across buffered/direct execution: callbacks and partial effects, XML/byte inputs,
large transfers, snapshots, data keys and disposal. Separate checks cover entry
ownership and concurrent caller-managed workers. The eight stable checks also
pass against each actual 0.1.0 entry on Node 22/24; all 63 extracted package files
match the hashed original tarballs. Exports, initialization and package requirements
match that release. Extraction result inference and other corrected behavior are
listed in the [changelog](../CHANGELOG.md). The original 1,611-case DOM-suite
replay and its nine classified expectation changes are recorded in the
[source audit](source-audit.md#comparison-with-published-010).

The four shared HTML/XML/SVG benchmark workloads and dense/sparse selector cases
also run in buffered/direct modes, checking exact outputs, repeated disposal and
independent live owners. All 48 generated inputs run in both modes. Fake-clock
tests cover ratio direction, control handling, whole-block filtering, interrupted
blocks, invalid measurements and cleanup after output changes or exceptions;
unit tests impose no elapsed-time or speedup threshold.

The release review changes the runtime paths listed in the source audit. Earlier
consumer snapshots and broader-corpus checks remain separate qualification
evidence. Custom-corpus lifecycle checks disable the authored memory budgets.

Saved-input checks cover 174 inputs. All 193 pipeline cases match each preserved
installed/development consumer snapshot on native/Wasm; these historical snapshots
do not qualify every downloader revision. Skips, explicit malformed-input
rejections and policy exclusions are never counted as successful-output passes.
Correctness/resource checks do not establish elapsed improvement or adoption.

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

For a historical Pages package, the optional arguments are `PACKAGE_ROOT TEST_ROOT`.
The workflow supplies the selected release's `test` directory, preserving its
own fixtures and known-failure guards. Published 0.1.0 reproduces 814 passes,
32 exclusions and two documented expected failures; applying today's fixtures
to that older binary would misclassify its known Unicode limitation.

## Additional checks

Types and isolated package imports require no Cheerio declarations. Sanitizer and
owned-buffer failure commands are in [setup](prototype.md); keep raw reports and
local paths outside Git. [Source-audit regressions](source-audit.md) cover
callbacks/coercion, lazy data, class spacing, traversal, fragment roots and XML
references. Foreign-content, template/select parsing, Unicode/token boundaries,
serializer quoting, command-buffer bounds, handles, disposal and worker cases
check successful outputs and tree/ownership invariants.

Owned-buffer fault tests recreate the document for every allocation countdown,
then verify retry, other live owners and disposal. HTML/XML query/serialization
sweeps cover 28 failed growth requests; XML-output sweeps cover 14 more in
encoded/raw modes. Multi-root queries recover from twelve failed growth requests
across HTML/XML and plain/scoped selectors; template scope unions cover two more.
Generation rollover and fragment-parent restoration are checked on retries.
These checks do not cover every upstream allocation or prove universal
out-of-memory recovery. Dependency tests reject modified inputs, patches and
cached trees without modifying the supplied upstream source.

## Broader corpus follow-up

The [balanced generator](../bench/balanced-fixtures.mjs) creates sixteen families
in each of HTML, XML and SVG with fixed seeds. The
[workload](../bench/corpus-workload.mjs) checks serialization, 27 selectors, raw
attributes/relations, traversal, callback observations, seeded edits, retained
snapshots and disposal. Four malformed XML/SVG inputs check rejection/lifecycle
safety separately from successful output comparisons.

A private convenience sample preserves 48 public HTTP responses from 50 fixed
requests, including redirects and error/challenge bodies. Two transport failures
had no replacement requests; one duplicate body pair is retained. The sample
contains no MDN pages and is not a random web or validated production distribution.
Original response data, decoded inputs and local reports remain outside Git.

The offline [checker](../bench/check-corpus.mjs) reads an `entries` array containing
`id`, `group`, `mode` (`html`/`xml`/`svg`), a relative UTF-8 `file`, `sha256`, and a
deterministic `seed` or explicit `operations`. It fetches nothing:

```sh
node --expose-gc bench/check-corpus.mjs \
  --manifest=./corpus/manifest.json --out=./reports/corpus.json
```

Backend/heap settings follow [setup](prototype.md). Mismatches/exceptions return
exit 2; reports retain phase hashes and lifecycle counters. The 96-input follow-up
has **92 exact matches and four explicit malformed-input rejections** on native,
all Wasm heaps and the portable entry under Node, with native sanitizer checks.
Direct-mode replays are checked separately. Reduced tests retain structural
sibling counting, explicit template-root and until-callback fixes exposed by
these inputs. [Performance outcomes](history/performance-review.md) remain separate.

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

[GitHub CI](releasing.md) also checks release policy and artifact integrity,
using a fake npm executable to verify publication failures without credentials or
registry access. Mock CLI/synthetic subprocesses omit `LD_PRELOAD` because they
load no addon; native DOM, lifecycle and worker checks retain sanitizers and leak
detection. Owned-buffer checks run even if the preceding suite fails, provided
the sanitizer build succeeded.
