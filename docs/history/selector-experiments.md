# Selector compatibility experiments

These intermediate results precede the
[final scalar-scan confirmation](../benchmarks.md#scalar-ascii-scan-confirmation).
Failed and inconclusive screens are retained here; they are not current
performance claims.

## Compatibility-gap follow-up

The Unicode/token, select-parser and clone-container changes keep the ordinary
ASCII path in C. An initial three-block pooled-Wasm selector screen found a
regression: baseline/candidate 0.846 with identical-code control 0.996, all blocks
retained and quiet prechecks. The token matcher then removed redundant operand
and boundary scans. A follow-up measured 0.956 with control 0.954 (inconclusive).
Code inspection also found a call from the class guard into the general value
matcher. The final code keeps constant-operator dispatch inline and the Unicode
helper separate; native disassembly confirms the guard no longer calls the
whole dispatcher.

Final fixed screens use one group of three rotated/mirrored blocks, two batches
per sample and the unchanged independent-probe filter of 1.5. The authored
120-row class/attribute replay uses 50 warmups and four replays per batch; the
saved consumer page uses five warmups and one replay. The tiny authored replay
had continued warming during the earlier ten-warmup runs, so those protocols
remain separate. All final blocks and controls are retained; all prechecks are
quiet. Ratios below are baseline/candidate, raw = filtered.

| Final short screen | Candidate | Identical-code control | Result |
|---|---:|---:|---|
| Authored class/attribute replay | 1.028 | 1.053 | Inconclusive control |
| Saved MDN consumer page | 0.979 | 1.025 | Inconclusive control |

The large initial selector gap is absent in the final observations, but neither
screen establishes the 2% non-regression gate or a speedup. The consumer ratio
also falls just below 0.98. An earlier consumer screen (1.207 raw / 1.296
filtered, control 1.053 / 1.113, two of three blocks retained) remains preserved
as inconclusive. Timing was stopped after the fixed panels, not extended to
obtain a passing ratio. Historical adoption results remain unchanged.

Before the final token optimization, a short native phase capture repeated four
MDN inputs and a sitemap three measured times after warmup. All outputs matched
and all 45 loads were disposed. The 11,538 backing allocation/reallocation
requests are unchanged from the earlier panel. Queries, binding work and parsing
lead the measured native phases; allocator hooks account for about 2.4% of their
exclusive time. Wrapped URI processing takes about half the instrumented total,
while synchronous DOM work takes about 15%. These timers perturb execution and
are bottleneck evidence, not performance ratios. A separate Node inspector
capture at a requested 100 microsecond interval collected 1,769 samples; the V8
tick profile includes initialization too. Both retain raw output locally.

This supports focusing future work on measured query/binding costs. It does not
justify larger heaps, new pool defaults or an allocator rewrite. No such defaults
changed in this pass. The final release Wasm still has no imports or diagnostic
exports.

## Warmup confirmation and normalization experiment

A separate VM trace followed 24 saved consumer replays. Wasm tier-up and JS
optimization continued beyond the earlier five warmups, including the final
traced round. Trace timings are diagnostic only. A fixed confirmation therefore
used 100 warmups, three independent groups of three balanced blocks and two
batches per sample. The selector panel used eight replays per batch; the consumer
used one. Aggregate ratios are medians of group medians, without control
normalization. All eighteen blocks were quiet and probe-retained; raw and
filtered results agree.

| Warmed compatibility screen | Baseline/candidate | Control | Result |
|---|---:|---:|---|
| Class/attribute replay | 0.9613 | 1.0050 | Regression screen fails |
| Saved MDN consumer page | 0.9819 | 0.9866 | Pass, narrow margin |

Timed batches had medians of 5.1 and 25.5 ms, respectively. Independent groups
still varied: selector candidate/control ranges were 0.928–1.066 / 0.990–1.119;
consumer ranges were 0.974–1.023 / 0.978–1.012. The scoped selector deficit
was unresolved at this checkpoint; this is not a general consumer slowdown or
a new adoption ratio. The later scalar-scan confirmation in the main performance
guide closes the screen.

Two subsequent C experiments were not retained. Avoiding preliminary ASCII
comparison scans measured 0.8924 with control 0.9996. Isolating multibyte
whitespace decoding measured 0.9952 with control 1.0213, which is inconclusive
under the fixed 2% control tolerance. Each used one predeclared nine-block
selector panel; all blocks were quiet and retained. A consumer attempt for the
first experiment stopped before timing because of a stale replay adapter.
The second experiment's conditional consumer panel was not run.

A separate prototype moved alias and `:contains()` expansion from JS into C on
selector-plan cache misses. It read the retained original cache key and wrote
directly into the existing document input buffer, without a separate temporary
normalization allocation. Input capacity could still grow; CSS parsing and plan
storage still allocate. Selectors use this input buffer separately from buffered
mutation commands. Positional and relative selection behavior remained in JS.
The prototype removed the JS alias map and expanded strings. It matched the JS
normalizer in 864 additional checks per backend, and repeated cache churn stayed
bounded. Native backing allocations on the authored alias replay remained
263 per document before and after.

| Normalization experiment versus preceding JS implementation | Baseline/candidate | Control | Result |
|---|---:|---:|---|
| Authored alias/contains replay | 1.0223 | 1.0238 | Inconclusive control |
| Saved MDN consumer page | 1.0121 | 0.9946 | Pass |

These fixed panels used the same warmed three-group protocol, with eight alias
replays or one consumer replay per batch. All eighteen blocks were quiet and
retained; raw and filtered ratios agree. Median/max batch times were 28.4/34.0 ms
and 26.3/31.4 ms. The alias candidate/control group ranges were
0.985–1.049 / 0.989–1.033; consumer ranges were 0.970–1.021 / 0.982–0.999.
The experiment establishes no convincing performance benefit, so normalization
stays in JS. None of these panels was extended to obtain a passing result.
All experimental code and raw evidence remain preserved locally. These
experiments left the compatibility runtime unchanged.

## Token-search follow-up

A native phase capture of the six authored selectors found repeated matching
more expensive than cached-plan lookup: 200 queries per selector spent
1.9–5.4 ms in the exclusive query phase versus 0.01–0.02 ms in plan lookup.
The compound ancestor selector was largest. These instrumented timings locate
work, not speedups. A short Node inspector capture retained 95 samples; it is
too small for precise attribution within native calls.

A prototype used `memchr` to find candidate token starts before checking Unicode
boundaries. It passed 31,008 additional differential comparisons per backend,
the native/Wasm suites, sanitizers, saved-input and consumer replay checks.
However, a dense repeated-character token exposed repeated search calls within
one word. A revised prototype skipped each failed token once and passed the
differential checks, but did not pass its fixed performance screen. Neither
version was retained.

| Fixed token-search screen | Baseline/candidate | Control | Retained / quiet blocks | Result |
|---|---:|---:|---|---|
| Initial version, selectors | 1.0070 | 1.0057 | 8/9 / 9/9 | Pass |
| Initial version, consumer | 1.0425 | 1.0573 | 9/9 / 8/9 | Inconclusive control |
| Skip failed tokens, selectors | 0.9796 | 0.9831 | 9/9 / 8/9 | Below 0.98 threshold |

Each panel used the warmed three-group protocol above. Aggregate raw and
filtered ratios agree; no control normalization or extra blocks were used.
Median/max batch times were 5.2/13.2, 28.3/71.2 and 5.8/12.3 ms, respectively.
The revised version's conditional consumer panel did not run. Boundary
regressions were retained, including near-whitespace characters that are not JS
separators. These experiments left the runtime and its compatibility-screen
result unchanged.
