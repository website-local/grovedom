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

### 0.1.2 API optimizations

The full **2,488-case suite** passes after batching static `until` traversals,
reusing live attribute snapshots, adding scalar containment and reducing handle
and input-transfer allocations:

| Backend | Node versions | Pass / exclusions |
|---|---|---:|
| Native | 22, 24 | 2,429 /59 |
| Pooled Wasm | 22, 24 | 2,437 /51 |
| Global Wasm | 22 | 2,433 /55 |
| Per-document Wasm | 22 | 2,434 /54 |

Forty-seven added cases cover stop-selector and duplicate-filter semantics,
callbacks that remove, insert, replace or move nodes on all three traversal axes,
live attribute writes during enumeration, prototype names, nested coercions,
containment, disposal, wide transfers and fragment boundaries. They also correct
a pre-existing callback traversal defect: later visits now follow links changed
by earlier callbacks. Shared cases reach installed and portable entries.

Native ASan/UBSan passes 2,429 cases with 59 exclusions, leak detection and no
findings. Owned-buffer checks recover from 105 failed growth requests, including
`until` result/ID growth; mark rollover, stop-node visibility and kernel containment
without ID allocation are checked separately. Native and pool each pass 1,000 seeded cases
in both execution modes, and 64 sanitized cases pass. Source and isolated package
declarations pass.

All 1,544 comparisons match fresh Cheerio output/events across 193 scenarios,
two preserved engine snapshots and four backends. These snapshots do not qualify
current production. Four 120-cycle / 2,430-lifetime authored memory budgets pass
with custom inputs disabled. Offline Node 22/24 installs, shared public contracts
and caller-managed workers pass; packaged portable normal/fallback paths each
pass 810 cases with 35 exclusions plus release contracts. There are no unexpected
failures, cancellations or TODOs in these completed correctness checks.

The artifact audit verifies the saved logs, source/artifact pairing and all
69 packaged files against both offline installations. Sixteen shared correctness
checks also pass on the separate Node 24 measurement server. Fresh hosted release
artifacts and broader browser qualification remain required; the independent
[timing limits](benchmarks.md#012-api-optimizations) are not correctness failures.

### 0.1.2 fragment, load, child and form fixes

The follow-up fixes ordinary queries across attached raw fragments, failed-load
ownership, excessive sibling retention from raw child reads, and form collection's
argument-count limit. The full **2,441-case suite** passes:

| Backend | Node versions | Pass / exclusions |
|---|---|---:|
| Native | 22, 24 | 2,382 /59 |
| Pooled Wasm | 22, 24 | 2,390 /51 |
| Global Wasm | 22 | 2,386 /55 |
| Per-document Wasm | 22 | 2,387 /54 |

Fourteen added cases cover option getters and construction exceptions, inherited
XML flags, reentrant loading, fragment-root unions, exact child identity through
replacement, and repeated forms. A shallow XML form with 130,000 disabled fields
serializes to the known empty result and remains usable afterward. This case does
not claim a completed large-form Cheerio comparison. An existing ordinary-query
assertion now includes the formerly missing inner match, confirmed against Cheerio;
the separate relative-list order remains covered.

Native ASan/UBSan passes the same 2,382 cases with leak detection and no findings.
Owned-buffer tests recover from 87 failed growth requests, including four new
first/last-child ID failures across HTML/XML. Native and pool each pass 1,000 seeded
cases in both execution modes; 64 sanitized cases and source/package declarations
also pass. All 193 scenarios match fresh Cheerio output/events on each preserved
engine 0.9.1/0.10.0 snapshot across all four backends. Four 120-cycle authored
memory budgets pass with custom inputs disabled; [resource checks](memory.md)
also confirm the child-retention reduction and zero owners after failed loads.

Offline Node 22/24 packages pass 56 shared public-contract checks per entry and
caller-managed worker checks. Packaged portable normal/fallback paths each pass
810 cases with 35 exclusions plus release contracts. There are no unexpected
failures, cancellations or TODOs in the completed checks. These are local checks;
fresh hosted release artifacts and broader browser qualification remain separate.
[Performance measurements](benchmarks.md) retain their own controls and limits.

### 0.1.2 insertion, traversal and ownership review

The four review fixes pass the **2,427-case suite**, including isolated main-thread
and caller-managed worker checks for the formerly hanging repeated insertion:

| Backend | Node versions | Pass / exclusions |
|---|---|---:|
| Native | 22, 24 | 2,368 /59 |
| Pooled Wasm | 22, 24 | 2,376 /51 |
| Global Wasm | 22 | 2,372 /55 |
| Per-document Wasm | 22 | 2,373 /54 |

There are no unexpected failures, cancellations or TODOs. The rebuilt native
ASan/UBSan suite passes 2,368 cases with 59 exclusions and leak detection; owned
buffer-failure checks and 64 sanitized fuzz cases also pass. Native and pooled
Wasm each pass 1,000 seeded cases in both execution modes, including repeated
node arrays/selections and foreign query contexts. Source and standalone package
declarations pass.

Fresh local tarballs pass offline Node 22/24 installation, fifty shared public
contract checks per entry and caller-managed worker checks. Packaged portable
normal/fallback paths each pass 810 cases with 35 exclusions, plus the release
contracts, under both Node versions. The original 288 review observations now
pass across nine configurations; all nine separate traversal reproducers reach
disposal and exit normally, including the native sanitizer configuration.

All 193 pipeline scenarios match fresh Cheerio output/events on each of two
preserved consumer snapshots, on native and all three Wasm heaps. Those snapshots
contain engine versions 0.9.1 and 0.10.0; they do not qualify current production
inputs or every downloader revision. Four **120-cycle / 2,430-lifetime authored
memory budgets** also pass with the custom corpus disabled. See
[memory](memory.md) and the separate [timing results](benchmarks.md#012-insertion-and-ownership-corrections).

These are local checks. Fresh hosted CI for these fixes, exact Node 22.0.0,
Windows/macOS and actual-browser reruns remain separate release qualification.
The reported 0.1.1 browser results below are unchanged.

### 0.1.2 initialization follow-up

Ten new regressions cover recursive initialization from option getters, option
enumeration and browser fetch, plus retry after getter failure. Seven reproduce
the preceding entry-state replacement bug. All thirteen initialization tests
now pass, including the existing async retry and independent-package checks.

The focused 92-case initialization, ownership, worker, heap and public-contract
scope passes with these backend exclusions:

| Backend | Node versions | Pass / exclusions |
|---|---|---:|
| Native | 22, 24 | 86 /6 |
| Pooled Wasm | 22, 24 | 92 /0 |
| Global Wasm | 22 | 88 /4 |
| Per-document Wasm | 22 | 89 /3 |

The same scope passes native ASan/UBSan with leak detection and no findings,
reusing the reviewed sanitizer binary because C sources are unchanged. Twenty-one
release checks and source/package declarations pass. Fresh 0.1.2 tarballs pass
offline installs, the forty-two public-contract checks per entry and caller-managed
workers on Node 22/24. Installed initialization/identity checks also pass fourteen
entry/heap/runtime configurations. Packaged portable normal/fallback checks each
pass 810 cases with 35 exclusions, plus the release contracts, under Node.

These earlier checks cover the initialization change specifically. The full
0.1.2 matrix above also includes the later insertion/ownership fixes; the matrix
below records 0.1.1. No performance multiplier is inferred from initialization.

### 0.1.1 full matrix

The released 0.1.1 review fixes pass the **2,394-case suite**. Its latest 32 cases cover
relative-list ordering and retained capacity, dense/deep trees, attached fragments,
repeated raw data writes, coercion and installed contracts. Identity/order assertions compare each
handle by reference, including across portable VM contexts. The preceding 178
attribute, callback, data and wrapper fixes and earlier selector-safety, template,
snapshot and release-workflow regressions remain enabled:

| Backend | Node versions | Pass / exclusions |
|---|---|---:|
| Native | 22, 24 | 2,335 /59 |
| Pooled Wasm | 22, 24 | 2,343 /51 |
| Global Wasm | 22 | 2,339 /55 |
| Per-document Wasm | 22 | 2,340 /54 |

Fresh native/Wasm builds and the rebuilt native ASan/UBSan binary pass their
applicable checks, with leak detection and no sanitizer findings. Owned-buffer
failure recovery, types, offline package installations on Node 22/24, 200 seeded
cases each on native/pool and 64 sanitizer fuzz cases also pass. Four authored
24-cycle memory-budget checks pass with the custom corpus disabled. The preceding
six-fix review's 74 Cheerio comparisons, and the earlier 1,000-case fuzz runs and
four 120-cycle memory budgets, remain separate historical qualification.
Portable browser normal/fallback checks each pass 810 cases with 35 exclusions,
plus the release corrections in HTML/XML and buffered/direct modes. These local
checks do not cover exact Node 22.0.0 or Windows/macOS; the separate
[hosted release matrix](releasing.md) passed for 0.1.1. Reported Firefox 150 and
Chromium 140 [demo runs](benchmarks.md#011-release-measurements) cover the four
authored workloads. Separate [correctness-page runs](#reported-browser-runs)
pass the selected suite in both browsers; WebKit and broader browser API
qualification remain open.

Installed Node, browser and native packages share forty-two public-contract checks
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

### Reported browser runs

The Firefox 150 and Chromium 140 results supplied on 2026-10-17 match the
0.1.1 correctness suite:

| Browser | Passed | Failed | Skipped | Known failures |
|---|---:|---:|---:|---:|
| Firefox 150 | 810 | 0 | 35 | 0 |
| Chromium 140 | 810 | 0 | 35 | 0 |

These are user-reported executions; browser-run binary hashes were not supplied.
A static audit confirms that both skip lists match the pinned 0.1.1 manifests.
The 845 cases comprise 721 selector cases, 68 escape cases and 28 additional DOM
cases in buffered/direct modes. The 35 skips are 33 documented selector
scope/compatibility exclusions and two lone-surrogate escape cases, leaving
810 eligible cases and no known failures.

This qualifies the selected DOM transformations through the browser ESM entry.
It does not cover the complete public API or all WPT tests. WebKit and broader
API/fallback coverage on actual browser engines remain unqualified, so browser
support stays best-effort. Layout, events and script execution are outside the
GroveDOM contract.

### Portable checks

For a portable module-graph check without a browser engine:

```sh
node --experimental-vm-modules test/browser-sandbox.mjs
GROVEDOM_BROWSER_FALLBACK=1 node --experimental-vm-modules test/browser-sandbox.mjs
```

These checks run under Node without Node globals in the browser module context.
They cover normal and fallback paths separately from the reported browser-page
runs and the benchmark demo's output comparisons.

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
Scoped-ordering scratch adds three failed-growth recovery checks across HTML,
XML and templates, verifying that ordering registers no additional nodes and
leaves subsequent queries usable.
First/last-child reads add four HTML/XML ID-growth failure checks, verifying retry,
stable identity and allocation-free empty-child results.
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

Version 3 cases also exercise existing-node arrays and selections for all four
insertion positions, duplicate `contents`/adjacent traversal and foreign
node/selection query contexts with matched and empty results. All eight input
shape combinations are scheduled deterministically. These checks use GroveDOM's
own one-physical-node and ownership contracts because Cheerio permits duplicate
child references and cross-document adoption. Retained handles are compared by
strict identity, not deep equality of wrapper objects.

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
unversioned and version 2 case files remain replayable. These are bounded seeded checks, not
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
