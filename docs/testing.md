# Correctness tests

`npm test` runs deterministic Node tests against the backend selected in
[setup](prototype.md#checks). The unit suite needs no network, browser or timing
run. Cases dispose their documents, including on failure.

| Source | What is checked |
|---|---|
| Cheerio 1.2.0 | Attributes, traversal, mutation, forms, CSS, extraction, static helpers and loading; fixed parser trees and differential API behavior |
| jQuery 3.7.1 | Selected whitespace/class, fragment insertion, mixed content and callback-index regressions |
| WPT / DOM, HTML and CSS standards | Selector order/scope/identity, escapes, static snapshots, duplicate IDs, foreign fragment CDATA and formatting-element parsing |
| GroveDOM regressions | Buffered observations, callbacks, handles/disposal, worker ownership, Wasm growth/pools, options, faults and standalone declarations |
| Balanced generated corpus | 48 seeded HTML/XML/SVG inputs covering width, depth, Unicode, long values, namespaces, malformed input, templates, forms and retained selections |

The [Cheerio/jQuery](../test/upstream/README.md) and [WPT](../test/web-platform/README.md)
manifests identify sources, licenses, adaptations and exclusions. Imported WPT
assertions are fixed upstream data. Independent tree checks verify reciprocal
links, acyclic structure and stable handle identity; exclusions do not count as passes.

## Current qualification

### Released 0.1.3 selection modes

Publication was reported on 2026-11-02. The checks below retain their original
source and artifact scope.

The simple-dual landing runs all **84 test files separately on Node 24.18.0**:

| Backend | Passed | Exclusions |
|---|---:|---:|
| Pooled Wasm | 2,575 | 51 |
| Native | 2,563 | 63 |

These suites retain compatible-mode coverage and add twelve mode cases for
HTML/XML, buffered/direct execution, maps, snapshots, nested loads, coercion,
disposal, live merge reads and mixed contexts. The same cases run in package and
portable release contracts. The current source also passes the earlier
570-assertion mode contract and 40 direct-method cases per mode. Global and
per-document heaps and the portable byte path each pass the twelve mode cases.

Assembled Node/native/browser packages pass public contracts and four concurrent
worker checks from an isolated consumer. Standalone Node/native/browser
declarations pass strict checking, including declaration bodies, without
third-party types. Workspace API assertions also pass. Source and packaged
normal/fallback browser sandbox runs each pass the 16-module portable graph,
release contracts and 810 selected browser cases with 35 exclusions. Those
standards cases still use compatible `load()`; the added mode contracts exercise
`loadFast()` too. These are Node VM checks, not new browser-engine runs.

The completed per-file runs have no failures, cancellations or TODOs. Two
initial native wide-form attempts stopped at the sampled RSS guard and a
smaller V8 heap limit. The unchanged 130,000-field test passes with the normal
64 MiB V8 heap and `--test-isolation=none`, removing the extra test coordinator
process. Both unsuccessful attempts remain recorded. The 192 MiB RSS stop uses
polling and is not a hard cap; runtime checks keep JIT enabled. Wasm and native
binaries are unchanged. This is API qualification, not consumer adoption evidence.

### 0.1.3 CI follow-up

CI is reported passing after `887268c`, which adds installed-worker diagnostics
and comparisons for both selection modes. The earlier Ubuntu 22.04/Node 22.0.0
worker timeout did not reproduce locally; its cause remains unknown. Exact
Node 22.0.0 with bundled npm 10.5.1 passes the offline two-package installer and
the original four-worker fixture. Updated checks also pass on Node 24.

All 33 benchmark checks pass on Node 22 Wasm/native and Node 24 Wasm. They verify
both modes' outputs, pair direction, matching controls, deadlines and retention.
A synthetic-clock browser-graph check covers all 36 comparison rows; it is
correctness evidence, not a performance measurement. The
[reported timings](benchmarks.md#013-reported-ci) retain their separate scope.

The worker check retains four concurrent workers, 76 contract cases per worker
and the 30-second timeout. A timeout now identifies package, worker index and
the last import/case/exit phase. An injected keepalive confirms diagnostic error
reporting; it does not reproduce or explain the original hosted stall.

### 0.1.3 release preparation

The final documentation checkpoint passes all **53 release checks**. Private
package fixtures pass the offline two-package installer, four concurrent workers
and all 69 installed-file hashes. Packaged normal/fallback VM paths each pass
the 16-module graph, release contracts and 810 cases / 35 exclusions. Runtime
and declaration sources are unchanged from the qualification above.

Those local fixtures reuse validated binaries and retain their original build
metadata; the Release workflow builds and verifies its own publication artifacts.
The separately [reported release benchmark](history/release-benchmarks.md#013-release-ci)
retains 36 rows and 759/759 blocks. The supplied table and publication report
do not add a separately inspected full hosted-matrix result or actual-browser run.

### Released 0.1.2

The 2026-10-24 pre-release review retains the 0.1.2 read-path runtime and its
matching C artifacts. Each full configuration runs **2,505 cases**:

| Configuration | Node | Pass / exclusions | Verification |
|---|---|---:|---|
| Native | 22, 24 | 2,446 /59 | Read-path checkpoint; unchanged runtime |
| Pooled Wasm | 22, 24 | 2,454 /51 | Read-path checkpoint; unchanged runtime |
| Global Wasm | 22 | 2,450 /55 | Fresh pre-release run |
| Per-document Wasm | 22 | 2,451 /54 | Fresh pre-release run |
| Native ASan/UBSan | 22 | 2,446 /59 | Fresh pre-release run with leak detection |

Fresh checks also pass 1,000 seeded cases each on native/pool, 64 sanitized
cases, and 105 owned-buffer growth-failure recoveries. All four 120-cycle /
2,430-lifetime authored memory budgets pass with custom inputs disabled; final
tracked live/control bytes are zero. No sanitizer findings, unexpected failures,
cancellations or TODOs occur in these runs. This is bounded verification, not a
proof of arbitrary-input safety or universal allocation-failure recovery.

Fresh offline Node 22/24 installs pass public contracts and caller-managed worker
checks. All 69 packaged files match both installations; source and standalone
package declarations pass. Packaged portable normal/fallback paths each pass
810 cases with 35 exclusions plus release contracts on both Node versions.
All 93 release checks pass on each version. These portable runs use Node, not
actual browser engines.

The [source review](source-audit.md) covers ownership, reentrant coercions,
mutation recovery, snapshots and transport lifetimes. No new release-blocking
defect was found within this scope. Full CI is reported passing for the released
commit `25faa49`. Both npm packages, the Git tag and the deployed demo manifest
confirm 0.1.2 publication; the local checks above retain their recorded scope.

The previous API checkpoint's 1,544 consumer comparisons cover 193 scenarios,
two preserved engine snapshots and four backends. They do not qualify the current
development consumer, production input weights or a complete crawl.
[Performance limits](benchmarks.md) remain independent of correctness results.

### 0.1.2 read-path follow-up

Seventeen regressions cover first-element versus aggregate reads, pending writes,
duplicate/reordered selections, empty results, raw-child snapshots, XML/templates,
wrapping callbacks and disposal. The
[original matrix, package and fixture checks](history/testing.md#012-read-path-follow-up)
retain their checkpoint scope.

### Reported 0.1.2 CI passes

The complete workflow, including the final gate, was reported passing for
`25faa49`, now tagged `v0.1.2`. A later report also states that CI passed. Their
[two benchmark summaries](history/release-benchmarks.md#012-reported-ci) remain
separate; raw job logs, block timings and benchmark artifact hashes were not
supplied for independent inspection. Publication metadata does not establish a
new actual-browser or complete-consumer qualification.

Earlier CI was reported passing for `71db6d3` and `654c9b9`; logs and artifact
hashes were not supplied for independent inspection. Their
[reported scope](history/testing.md#reported-012-ci-passes) and
[benchmark rows](history/development-benchmarks.md#012-reported-ci-runs) remain separate.
The `c807bdb` benchmark receipt alone did not confirm every CI job.

<a id="012-api-optimizations"></a>
<a id="012-fragment-load-child-and-form-fixes"></a>
<a id="012-insertion-traversal-and-ownership-review"></a>
<a id="012-initialization-follow-up"></a>
<a id="011-full-matrix"></a>
Earlier API, fragment/load/child/form, insertion/ownership, initialization and
0.1.1 matrices are in [checkpoint history](history/testing.md).

## Browser entry

Serve the workspace and matching Wasm over HTTP, then open
`test/browser-correctness.html?wasm=../assets/grovedom.wasm`:

```sh
node scripts/serve-demo.mjs . 8080
```

The page runs the selected 845 WPT-derived cases through async initialization
and reports passes, failures, exclusions and known failures separately. It
makes no benchmark or CDN request. A resolved known failure requires review.

### Reported browser runs

The supplied 2026-10-17 results match the 0.1.1 suite; binary hashes were not supplied:

| Browser | Passed | Failed | Skipped | Known failures |
|---|---:|---:|---:|---:|
| Firefox 150 | 810 | 0 | 35 | 0 |
| Chromium 140 | 810 | 0 | 35 | 0 |

Both skip lists match the pinned manifests. The 845 cases comprise 721 selector,
68 escape and 28 additional DOM cases in both execution modes. The 35 skips are
33 scope/compatibility exclusions and two lone-surrogate escapes. These selected
transformations do not cover the entire API, WebKit or broader browser fallback
behavior; browser support remains best-effort.

### Portable checks

```sh
node --experimental-vm-modules test/browser-sandbox.mjs
GROVEDOM_BROWSER_FALLBACK=1 node --experimental-vm-modules test/browser-sandbox.mjs
```

These run under Node with no Node globals in the browser module context. They
exercise the portable graph, not a browser engine. Optional `PACKAGE_ROOT TEST_ROOT`
arguments select a package and its matching fixtures. Historical Pages releases
must use their own assertions: 0.1.0 has 814 passes, 32 exclusions and two known
failures, unlike the current suite.

## Additional checks

[Setup](prototype.md#checks) covers standalone declarations, separate sanitizer
builds and owned-buffer fault injection. Fault tests recreate the document for
each countdown, then check retries, another live owner and idempotent disposal.
They cover input/transfer/output/result growth, query mark rollover, fragment-parent
restoration, scoped ordering, child IDs and `until` traversal. They do not inject
every Lexbor or host allocation failure.

[Memory budgets](memory.md#verification-scope) require the authored corpus;
custom manifests disable the fixed budgets. Dependency tests verify upstream,
patch and cached-tree fingerprints without changing the supplied upstream tree.
Mock release commands omit sanitizer preload because they load no addon; native
DOM and worker checks retain it. Fault checks still run after a failing sanitizer
suite if the build succeeded. [CI](releasing.md) also checks artifact integrity
and publication failures using mock commands without registry credentials.

## Broader corpus follow-up

The [balanced generator](../bench/balanced-fixtures.mjs) supplies sixteen families
in each of HTML, XML and SVG. The [workload](../bench/corpus-workload.mjs) checks
serialization, 27 selectors, raw relations, callbacks, seeded edits and retained
snapshots. Four malformed XML/SVG inputs check rejection/lifecycle safety.

The separate private convenience sample preserves 48 public responses from
50 fixed requests: no replacements for two transport failures, with redirects,
error/challenge bodies and one duplicate body pair retained. It contains no MDN
pages and is not a representative production distribution. The combined 96-input
check has 92 exact matches and four explicit rejections on native, every Wasm heap
and the portable Node entry, including native sanitizer and direct-mode checks.

The offline [checker](../bench/check-corpus.mjs) fetches nothing. Its manifest
`entries` contain `id`, `group`, `mode` (`html`/`xml`/`svg`), relative UTF-8 `file`,
`sha256`, and deterministic `seed` or explicit `operations`:

```sh
node --expose-gc bench/check-corpus.mjs \
  --manifest=./corpus/manifest.json --out=./reports/corpus.json
```

Mismatches/exceptions exit 2; reports preserve phase hashes and lifecycle counters.
Raw inputs and local reports remain outside Git.

## Seeded fuzzing

`npm run test:fuzz` compares buffered/direct execution with Cheerio and checks
callbacks, partial effects, queued writes, retained selections and tree invariants.
Every ninth generated input is corrupted for safety checks; malformed recovery is
not compared with Cheerio. Rejected inputs must leave later documents usable.
Version 3 also covers repeated existing-node arrays/selections, duplicate traversals
and foreign contexts using GroveDOM's one-physical-node and ownership contracts.

Set disk-backed `TMPDIR` and `GROVEDOM_FUZZ_DIR` before running:

| Option | Behavior |
|---|---|
| `GROVEDOM_FUZZ_SEED` | Unsigned 32-bit seed; invalid values fail explicitly |
| `GROVEDOM_FUZZ_CASES` | Positive case count; default 1,000 |
| `GROVEDOM_FUZZ_MALFORMED=0` / `1` | Force differential-only / malformed-safety cases |
| `GROVEDOM_FUZZ_TEMPLATES=1` | Include templates in every HTML case |
| `GROVEDOM_FUZZ_CASE_FILE` | Replay one saved input, independently of generator state |

`active.json` and `stage.json` preserve the last input/operation if a process
crashes. Ordinary failures save a named reproducer and actual/expected observations.
Reports distinguish requested/matched actions, accepted/rejected safety cases and
live allocations. Older unversioned/version 2 inputs remain replayable. CI runs
200 cases per backend and 64 sanitized cases, uploading failures. This is bounded
seeded testing, not coverage-guided fuzzing.
