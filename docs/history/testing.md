# Earlier correctness checkpoints

These counts belong to their recorded implementation checkpoints. The
[current qualification](../testing.md#current-qualification) includes later fixes.

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
memory budgets pass with custom inputs disabled; [resource checks](../memory.md)
also confirm the child-retention reduction and zero owners after failed loads.

Offline Node 22/24 packages pass 56 shared public-contract checks per entry and
caller-managed worker checks. Packaged portable normal/fallback paths each pass
810 cases with 35 exclusions plus release contracts. There are no unexpected
failures, cancellations or TODOs in the completed checks. These are local checks;
fresh hosted release artifacts and broader browser qualification remain separate.
[Performance measurements](../benchmarks.md) retain their own controls and limits.

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
[memory](../memory.md) and the separate [timing results](../benchmarks.md#012-insertion-and-ownership-corrections).

These were local checks at that checkpoint. The two follow-ups now have
[reported CI passes](../testing.md#reported-012-ci-passes); fresh release-workflow artifacts
and actual-browser reruns remain separate release qualification. The reported
0.1.1 browser results below are unchanged.

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
[hosted release matrix](../releasing.md) passed for 0.1.1. Reported Firefox 150 and
Chromium 140 [demo runs](../benchmarks.md#011-release-measurements) cover the four
authored workloads. Separate [correctness-page runs](../testing.md#reported-browser-runs)
pass the selected suite in both browsers; WebKit and broader browser API
qualification remain open.

Installed Node, browser and native packages share forty-two public-contract checks
across buffered/direct execution: callbacks and partial effects, XML/byte inputs,
large transfers, snapshots, data keys and disposal. Separate checks cover entry
ownership and concurrent caller-managed workers. The eight stable checks also
pass against each actual 0.1.0 entry on Node 22/24; all 63 extracted package files
match the hashed original tarballs. Exports, initialization and package requirements
match that release. Extraction result inference and other corrected behavior are
listed in the [changelog](../../CHANGELOG.md). The original 1,611-case DOM-suite
replay and its nine classified expectation changes are recorded in the
[source audit](../source-audit.md#comparison-with-published-010).

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

## 0.1.2 read and API checkpoints

These are the checks recorded before the final pre-release review.

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
[remote confirmations](../benchmarks.md#012-read-paths-and-remote-comparisons)
include incomplete panels and control drift, independently of these correctness
passes. Final hosted release artifacts still require the manual workflow.

### Reported 0.1.2 CI passes

The user reported passing CI on 2026-10-22 for `71db6d3` (fragment/load/child/form
fixes) and `654c9b9` (API optimizations). This records hosted CI status for both
implementation checkpoints. The local matrices below retain their own scope;
CI logs and artifact hashes were not supplied for independent inspection.

The supplied [Wasm summaries](../benchmarks.md#012-reported-ci-runs) compare each
candidate with published 0.1.1. CI has no speed threshold, so its pass status does
not establish full-scope non-regression or adoption. Fresh artifacts from the
[manual release workflow](../releasing.md) and broader actual-browser qualification
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
[timing limits](../benchmarks.md#012-api-optimizations) are not correctness failures.
