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

### 0.1.2 read-path follow-up

The **2,505-case suite** passes on Node 22 and 24: native has **2,446 passes /
59 exclusions**, and pooled Wasm has **2,454 /51**. Seventeen added cases cover
first-element versus aggregate reads, duplicate/reordered selections, pending
writes, empty results, raw child snapshots and identity, templates, XML, nested
wrapping callbacks and disposal. A size-scaling check verifies bounded getter
operands without narrowing aggregate text.

Focused global and per-document Wasm checks each pass 52 cases on Node 22.
Source/package declarations and fresh offline Node 22/24 installations pass;
all 69 packaged files match the server candidate. Installed Node, browser and
native entries also match all four read-fixture outputs. Packaged portable
normal/fallback checks each pass 810 cases with 35 exclusions and release
contracts under Node; these are not new browser-engine runs.

The C artifacts are unchanged. The preceding sanitizer, fuzz and fixed memory
budget results below retain their original qualification scope. The
[remote confirmations](benchmarks.md#012-read-paths-and-remote-comparisons)
include incomplete panels and control drift, independently of these correctness
passes. Final hosted release artifacts still require the manual workflow.

### Reported 0.1.2 CI passes

The user reported passing CI on 2026-10-22 for `71db6d3` (fragment/load/child/form
fixes) and `654c9b9` (API optimizations). This records hosted CI status for both
implementation checkpoints. The local matrices below retain their own scope;
CI logs and artifact hashes were not supplied for independent inspection.

The supplied [Wasm summaries](benchmarks.md#012-reported-ci-runs) compare each
candidate with published 0.1.1. CI has no speed threshold, so its pass status does
not establish full-scope non-regression or adoption. Fresh artifacts from the
[manual release workflow](releasing.md) and broader actual-browser qualification
remain separate requirements.

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

The preceding 2,441-case matrix, sanitizer, faults, consumer replays, packages
and resource checks pass. [Checkpoint details](history/testing.md#012-fragment-load-child-and-form-fixes)
include the 130,000-field form and failed-load ownership checks.

### 0.1.2 insertion, traversal and ownership review

The preceding 2,427-case matrix, sanitizer, fuzzing, consumer and package checks
pass. [Checkpoint details](history/testing.md#012-insertion-traversal-and-ownership-review)
retain the insertion-hang reproducers and ownership scope.

### 0.1.2 initialization follow-up

Thirteen initialization tests and the focused 92-case lifecycle scope pass;
later full matrices include them. [Checkpoint details](history/testing.md#012-initialization-follow-up)
record package, retry and reentrancy qualification.

### 0.1.1 full matrix

Released 0.1.1 passes its 2,394-case local suite and the hosted release matrix.
[Historical counts and checks](history/testing.md#011-full-matrix) remain separate
from current development and the reported browser runs below.

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
