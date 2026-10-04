# Performance evidence and measurement

The primary target is **Node with pooled Wasm**. Architectural refactoring must
preserve its full-workload performance within measurement noise, as well as
successful outputs and lifetime behavior.

## Acceptance

The adoption requirement remains at least **3× current Cheerio** on the complete
required DOM workload, including bindings, callbacks, serialization and disposal.
Also beat the fastest behaviorally acceptable Cheerio/parse5 or htmlparser2
configuration. This is not a whole-downloader speedup, nor automatically a 3×
requirement against optimized htmlparser2.

Use the same input bytes, parser options, workload weights and output contract.
Exclude network/disk with preloaded deterministic inputs. Keep recurring instance
creation, encoding, mutations, serialization, cleanup and in-batch GC in timing.
Do not infer backend superiority from parser-only or call-boundary measurements.

## Short checks

- Review existing results before running anything new.
- Use short batches fitting brief idle windows. Fix the panel/run count before
  looking at results; do not extend long campaigns to chase a passing ratio.
- Check CPU and sibling activity before every balanced block. Keep identical-code
  controls in the same rotation and run only one implementation at a time.
- Retain all raw samples. The established independent-probe max/min filter is
  1.5; never filter on candidate time, ratio or GC behavior.
- Report raw/filtered ratios, retained blocks, quiet prechecks and controls.
  Never normalize candidate ratios by control ratios. A quiet precheck does not
  guarantee an uninterrupted block or remove JIT/order effects.
- Keep different warmup/batch protocols separate. Short diagnostics with too few
  independent groups cannot establish a precise non-regression result.
- Use release artifacts paired with their JS. Keep tests/builds/profilers out of
  timing windows; keep logs, CPU inventories and local paths outside public docs.

The operational regression screen uses raw/filtered baseline/candidate medians
at least 0.98 and controls within 0.98–1.02. This is a measurement tolerance, not
proof of exactly zero slowdown. Inconclusive controls remain inconclusive.

## Established scoped evidence

The pre-refactor `b27dbe2` checkpoint measured:

| Panel vs current Cheerio | Native median | Pooled Wasm median |
|---|---:|---:|
| Mixed synthetic HTML/XML | 5.804× | 5.400× |
| Complete nineteen-scenario consumer | 4.920× | 4.621× |
| Eight saved MDN pages, raw | 5.480× | 5.102× |

Those panels passed their scoped aggregate rules and faster-compatible-baseline
checks. Individual pooled SVG and native XML regression margins were narrow.
They are historical results, not measurements of browser performance or proof of
production adoption. See [full evidence and controls](history/benchmarks.md#wasm-first-investigation-after-2eef7b6).

The subsequent [five-candidate recheck](history/benchmarks.md#candidate-recheck-after-b27dbe2)
promoted none: compiler, inlining, caching and native-layout gains were mixed.
Ten original panels retained 163/165 probe-filtered blocks, only 139 also quiet.
Four missing panels were completed with short, separately reported screens.
All 23 short blocks were quiet/probe-retained, but one control still failed.

## Architecture refactor screen

Six fixed short panels compared the pre-refactor release with the public
Node/pooled-Wasm entry and a byte-identical baseline control. Each panel used
three fresh process groups, three rotated/mirrored blocks per group, twenty
warmups and two batches of one complete replay per request. Startup and IPC were
excluded. All 54 blocks passed the unchanged independent-probe filter; raw and
filtered estimates therefore agree. Estimates below are medians of group medians,
with baseline/candidate ratios above one favoring the refactor.

| Panel | Node | Refactor | Control | Quiet prechecks | Numerical screen |
|---|---:|---:|---:|---:|---|
| XML | 22 | 1.0363 | 1.0015 | 3/9 | Pass |
| XML | 24 | 0.9724 | 0.9768 | 8/9 | Inconclusive |
| Mixed synthetic | 22 | 0.9847 | 0.9762 | 5/9 | Inconclusive |
| Mixed synthetic | 24 | 0.9932 | 0.9807 | 9/9 | Pass |
| Nineteen-case consumer | 22 | 1.0353 | 1.0226 | 9/9 | Inconclusive |
| Nineteen-case consumer | 24 | 1.0383 | 1.0068 | 7/9 | Pass |

All panels retain three blocks in each of three groups. Busy prechecks remain in
the results, not silently filtered. Three controls exceed the fixed 2% tolerance;
quiet prechecks alone did not eliminate drift. These short results do **not**
establish complete non-regression acceptance, a reproducible slowdown, or a new
Cheerio speedup. No extension was run to chase a pass. Performance acceptance
remains open for a later quiet-window check; the architectural checkpoint is not
a production-performance approval.

A separate, fixed nine-block XML/Node 24 confirmation began after a quiet host
precheck. Every timed-block precheck subsequently reported busy activity. All
nine blocks passed the probe filter: raw/filtered candidate ratio 0.9509 and
control 1.0804. Group candidate medians ranged 0.8718–1.1275; controls ranged
0.8873–1.1275. This confirmation is also inconclusive and is not combined with
the earlier panel. It demonstrates that a quiet startup check did not provide a
stable measurement window. No additional blocks were added.

## Harnesses

`bench/window.mjs --manifest=FILE --groups=1..3` implements this bounded protocol
with sibling-aware load checks. A manifest supplies named variant entry paths,
optional explicit initialization `options`, and a shared workload/corpus.

`bench/run.mjs` is an authored comparison; `bench/process.mjs` and
`bench/short.mjs` support explicit isolated variants. Their historical defaults
are not a recommendation for another long run: set bounded warmups, blocks,
batches and iterations for the input size. Developer harnesses use
`diagnostics/`; shipped entries do not.

`bench/consumer-replay.mjs` executes the deterministic real consumer transforms.
`bench/phase-profile.mjs`, `bench/consumer-profile.mjs` and CPU/allocation tools
are diagnostic, never release timing evidence. [Memory](memory.md) and
[stack](stack.md) describe separate verification.

The browser demo compares three short pairs against DOMParser with exact output
checks. It is not a Cheerio baseline or an adoption gate.
