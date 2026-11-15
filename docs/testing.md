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

<a id="014-namespace-selection-and-decoding-review"></a>
Experimental **0.1.4 is published on npm**. Its namespace and selection changes
landed in `5026b83`; `aaf989b` withdrew the direct byte-input shortcut to restore
ordinary Node decoding. Development 0.1.5 currently changes documentation and
version metadata only.

| Checkpoint | Evidence |
|---|---|
| `5026b83`, Node 24.18.0 full suites | 90 files / 2,946 cases per backend: pooled Wasm 2,895 passes / 51 exclusions; native 2,883 / 63 |
| Namespace lifetime fix | 410 focused passes and eighteen injected native history/clone failure sites |
| Hosted CI at `5026b83` | User reports every job and the required gate passed, including macOS |
| Decoder correction | 146 focused passes across decoding, loading/options, both backends, global/document Wasm heaps and portable transport; both new regressions fail on `5026b83` and pass after correction |
| Corrected package fixtures | 69 files verified; 76 contracts per Node/browser/native entry and per each of four workers; four public decoder cases |
| Corrected normal/fallback browser VM | Each passes sixteen modules, release contracts and 810 cases / 35 exclusions |
| Corrected `aaf989b` release context | User reports development and release CI passed; npm 0.1.4 publication reported on 2026-11-15 |

The locally counted full suites apply to `5026b83`, before the decoder
correction; the focused/package/VM checks qualify that correction. Later hosted
passes are user-reported, without independently retrieved logs or artifact
hashes. Their CI coverage does not extend the named actual-browser or downstream
qualification. The new 0.1.5 metadata is outside those hosted runs.

The [namespace/selection record](history/selection-and-namespace-reuse.md#qualification)
and [decoder follow-up](history/selection-and-namespace-reuse.md#decoder-correction)
preserve the exact scope, unsuccessful attempts and corrected checker.
[Performance evidence](benchmarks.md#014-reported-ci) keeps the earlier checkpoint
and both corrected-source CI receipts separate. The withdrawn byte shortcut's
earlier timing and capacity benefits no longer apply.

## Earlier qualification

Counts and reported CI results belong to their named source/artifact checkpoints.
Exclusions, failed attempts and coverage limits remain in the linked records.

| Checkpoint | Detailed record |
|---|---|
| <a id="014-style-and-wrapper-reuse-local"></a>0.1.4 style/wrapper reuse | [85 files / 2,752 cases per backend](history/operation-reuse.md#correctness) |
| <a id="released-013-selection-modes"></a>0.1.3 selection modes | [84 files, mode contracts, packages and workers](history/testing.md#released-013-selection-modes) |
| <a id="013-ci-follow-up"></a>0.1.3 CI follow-up | [Reported `887268c` pass and worker-timeout investigation](history/testing.md#013-ci-follow-up) |
| <a id="013-release-preparation"></a>0.1.3 release preparation | [53 release checks and offline package verification](history/testing.md#013-release-preparation) |
| <a id="released-012"></a>0.1.2 release | [2,505-case matrix, sanitizer, fuzz, fault and memory checks](history/testing.md#released-012) |
| <a id="012-read-path-follow-up"></a>0.1.2 read paths | [Seventeen regressions, matrix and package checks](history/testing.md#012-read-path-follow-up) |
| <a id="reported-012-ci-passes"></a>0.1.2 hosted CI | [Reported passes and their limits](history/testing.md#reported-012-ci-passes) |
| <a id="012-api-optimizations"></a>0.1.2 API optimizations | [Runtime and consumer comparisons](history/testing.md#012-api-optimizations) |
| <a id="012-fragment-load-child-and-form-fixes"></a>Fragment/load/child/form | [Regression and resource checks](history/testing.md#012-fragment-load-child-and-form-fixes) |
| <a id="012-insertion-traversal-and-ownership-review"></a>Insertion/ownership | [Runtime, lifecycle and consumer checks](history/testing.md#012-insertion-traversal-and-ownership-review) |
| <a id="012-initialization-follow-up"></a>Initialization | [Reentrancy and retry checks](history/testing.md#012-initialization-follow-up) |
| <a id="011-full-matrix"></a>0.1.1 | [Full matrix and selected browser results](history/testing.md#011-full-matrix) |

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
