# Namespace lifetime and selection reuse

The 0.1.4 development source fixes namespace-history retention before adding
scoped JavaScript work reductions. This checkpoint preserves the public API and
both selection modes.

This record preserves the measurements and qualification of `5026b83`.
Later review withdrew its direct byte-input shortcut after confirming two
decoding regressions: bypassing a Buffer prototype decoder installed before
import, and observing an inherited Buffer length getter for Uint8Array input.
Current source restores ordinary decoding. The byte-input timing and capacity
benefits below are historical and do not apply to the corrected source.
See [current qualification](../testing.md#current-qualification).

Namespace restoration metadata now belongs to a node independently of its
public handle ID. Cloning an unobserved descendant no longer creates an ID just
to copy that metadata. Destroyed unobserved subtrees release their histories,
renaming transfers histories to the replacement interface, and failed clones
release their partial trees. Explicitly retained descendant handles continue to
keep their detached subtrees usable.

The selection changes preserve callback order, conversion timing, snapshots,
chain history and disposal checks:

- Array `extract()` uses direct iteration and scalar text reads. `has(string)`
  keeps the original query per root while avoiding temporary wrappers.
- Select `val()` converts values before resolving the current options, then
  writes selected attributes directly. Membership indexing requires at least
  32 values and 64 options.
- Simple compound `is()` selectors use the existing boolean kernel operation.
  Complex selectors retain their query semantics. A numeric assignment of the
  same member skips buffer copying after validation.
- Class removal uses an index only with at least 32 requested and 32 existing
  tokens. `closest()` delays its deduplication Set until 64 distinct matches.
- Callback filters with at least 64 inputs allocate output lazily and compact
  results retaining at most one quarter of the input.
- At this checkpoint, Node Wasm snapshots and validates UTF-8 byte inputs of at least
  8192 bytes before reading options. Invalid UTF-8 and custom Buffer decoding
  were intended to retain the string path, but the later regressions above
  invalidate that general compatibility claim. This shortcut is withdrawn.

The shared verification workflow also moves its portable Node 24 job from
`macos-14` to `macos-15`, following the retirement of the older runner image.
The required gate and its dependencies remain intact.

## Qualification

Node 24.18.0 checks **90 files and 2,946 cases per backend**: Wasm passes
**2,895 with 51 exclusions**; native passes **2,883 with 63 exclusions**.
There are no final failures, cancellations or TODOs. The
[namespace regressions](../../test/namespace-history.test.mjs),
[selection contracts](../../test/selection-reuse.test.mjs) and
[byte-input contracts](../../test/byte-input.test.mjs) cover the new behavior.
The selection and byte contracts also pass on unchanged reference JavaScript.
Namespace behavior passes there while the four retention regressions fail as
expected. A private native probe covers eighteen injected history/clone failure
sites; this is not exhaustive upstream allocation-failure or sanitizer coverage.

Global/document heaps and portable transport pass the new cases. Assembled
Node/browser/native packages each pass 76 contracts and four package workers
pass the same contracts. Normal/fallback VM browser checks each pass the
16-module portable graph, release contracts and 810 cases with 35 exclusions.
These local checks do not establish an installed-package, actual-browser or
complete-consumer pass. The user subsequently confirmed all hosted jobs and
the gate, including macOS, for `5026b83`; that confirmation predates the decoder
correction. Type checking passes with library declaration checking skipped.

Deterministic probes avoid 128 wrappers in each extraction, `has()` and option
setter fixture. A 1,024-input callback filter retains 0/32 bytes for empty/sparse
outputs instead of 4,096 bytes; the dense case remains 4,096 bytes. The historical
1 MiB byte fixture used 5 MiB of Wasm capacity instead of 7 MiB after serialization;
that benefit is withdrawn with the shortcut.
These are scoped allocation/capacity observations, not sustained total-memory
measurements. Namespace replacement backing plateaus after initial warmup and
returns to zero on disposal.

## Bounded comparison

A separate fixed comparison uses matching source/native/Wasm builds of this
checkpoint and `1bbd99c`, with independent identical-code controls. Sixteen
processes cover twenty authored complete cycles (numeric assignment applies
only to compatible mode), both backends/modes and reversed import/case orders.
All 14,592 warmup/timed outputs match. Reference/current ratios above one favor
the candidate: array extraction is 1.343–1.386, direct `has()` 1.271–1.595,
large select setters 1.279–1.359, long class removal 1.440–1.661, and large Wasm
byte input 1.159–1.200. These are complete authored cycles, not isolated causes.

Unfavorable cases remain: fast Wasm late scalar matching is 0.951, native small
class removal 0.928/0.919, native dense callback filters 0.940/0.937, and the
128-distinct-result native `closest()` fixture 0.953 in both modes. Small byte
and always-changing assignment cases also include adverse observations.
Control offsets and timed-half disagreements prevent general conclusions.
The current `closest()` panel establishes no dependable elapsed gain.

The unchanged four-case standard suite runs separately in 32 capped slices,
with 1,414 complete blocks, 1,365 probe-filtered blocks and 31 deadline partials.
All slices meet the three-complete-block minimum. Combined filtered ratios are:

| Workload | Compatible | Fast |
| --- | ---: | ---: |
| articles-120 | 0.986 | 0.982 |
| articles-600 | 1.032 | 1.005 |
| sitemap-600 | 0.998 | 0.989 |
| svg-300 | 1.002 | 1.029 |

Filtered identical-code controls span 0.962–1.079. Do not average workloads or
normalize by those controls. Timing is best effort after the fixed host-admission
backoff, with finite warmups, both orders and adverse/partial results retained.
There is no general speedup, non-regression or complete-consumer adoption claim.

Caller batching has no identified repeated DOM merge to change. Tag prechecks,
secondary attribute guards, streaming contains, wide attribute indexes and
bounded custom nth-of remain deferred for a matching workload. Permanent
stepping, relational existence replacement, automatic buffer discard, general
form-serialization replacement and default block I/O remain excluded in their
proposed forms. Keep Cheerio as the consumer default and `loadFast()` opt-in.

## Decoder correction

Subsequent review found two byte-decoding regressions in that commit: a Buffer
prototype decoder installed before import could be bypassed, and decoding a
Uint8Array could newly observe an inherited Buffer length getter. The current
source restores ordinary decoding and removes the direct-byte shortcut. Both
[decoder regressions](../../test/node-decoding.test.mjs) fail before the correction
and pass afterward. Fresh focused checks have **146 passing executions** across
the decoder, byte inputs, Node/native loading and options, global/document Wasm
heaps and portable transport. Two earlier combined test attempts were stopped
by the sampled RSS guard and remain unsuccessful observations.

Fresh private assembly verifies all **69 package files** against current source
and retained matching binaries. Node, browser and native entries each pass 76
contracts; four workers pass the same contracts with their effective heap
ceiling checked. Both decoder regressions also pass through each assembled Node
loader, giving four public-loading cases. Normal/fallback browser VM runs each
pass sixteen modules, release contracts and **810 cases / 35 exclusions**.
This uses isolated package-resolution fixtures, not a new npm installation,
actual browser or downstream replay. An initial public decoder checker also
counted later parser/output Buffer reads; its corrected check stops observation
at the decoding/options boundary. The failed checker remains recorded.

The full suite and hosted pass above apply to `5026b83`; they are not a fresh
full-suite or hosted pass for this correction. The byte shortcut's earlier
timing and capacity results no longer describe current source. Final corrected
commit CI and release-artifact checks remain required before publication.

## Release follow-up

The decoder correction was committed in `aaf989b`. Development and release CI
were subsequently reported passing in that release context, and npm 0.1.4
publication was reported on 2026-11-15. The [separate CI receipts](release-benchmarks.md#014-release-ci)
close the earlier pending reported-CI status while retaining the local review's
scope and failures. Exact-current-package consumer qualification remains open.
