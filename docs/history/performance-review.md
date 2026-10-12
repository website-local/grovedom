# Performance review

This record summarizes the completed, bounded investigation of regressions against
0.1.0 and later isolated optimizations. Ratios above one favor the candidate.
Raw, unfavorable and incomplete observations remain preserved; no result is
normalized by its control or filtered using candidate execution times.

## Current decision

Retain the Wasm HTML opening-tag span writer and qualified correctness fixes,
including raw XML attribute quotes. Native keeps its previous HTML writer.
The final XML attribute-atom optimization is not selected; its selector and
allocation-failure regressions are retained.

**Full-scope non-regression and production adoption remain unverified.** The
selected combination's original twenty-panel comparison has six practical median
passes, one failure and thirteen inconclusive results. Closing the investigation
does not turn these results into passes. See [testing](../testing.md) for the
separate correctness/resource qualification and [benchmark rules](../benchmarks.md#short-checks).

## Best-effort isolated optimizations

Three changes were isolated against otherwise identical source: HTML opening-tag
spans, bounded XML-name comparison and JSON attribute spans. Sixteen Node 24 panels
used twelve fresh process groups, eight mirrored blocks and independent copies of
each module graph. All 192 measured workers completed; 8,274/9,216 batches survived
the independent whole-block probe max/min ≤1.5 filter. An initial zero-block
warmup stop and a prospective resource-only guard amendment remain recorded;
the amendment changed no sample count, timing rule, input or deadline.

Ordinary GC/JIT remains included. Common benchmark-only old/semispace limits were
128/4 MiB; authored batches contained 16 HTML120, four HTML600 or 32 XML/SVG
replays, and corpus batches covered an entire group. Orders rotated, output was
checked every batch, and load pauses had a fixed ten-minute allowance. These are
benchmark settings, not runtime defaults.

p90/p95 describe fixed-batch amortized replay time, not individual-document
latency. The primary one-sided p90 test swaps labels across whole process groups,
assuming exchangeability under the null, with Holm correction over all sixteen
panels. Pointwise 95% intervals use 10,000 whole-process bootstrap draws. Medians
and p95 are secondary. Every panel exceeds eight eligible groups and 128 retained
batches per role.

| Panel | Retained batches/role | Paired median | p90 | p95 | Adjusted p90 p | Median control |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| html-wasm-html120 | 168/192 | 1.0693 | 1.0708 | 1.0589 | 0.6543 | 1.0074 |
| html-wasm-html600 | 180/192 | 1.0649 | 1.0842 | 1.1186 | 0.0078 | 0.9972 |
| html-native-html120 | 178/192 | 1.0308 | 1.0549 | 1.0909 | 0.4995 | 1.0061 |
| html-native-html600 | 176/192 | 1.0443 | 0.9986 | 0.9586 | 1.0000 | 1.0083 |
| html-browser-html120 | 170/192 | 1.0692 | 1.0893 | 1.1012 | 0.0220 | 1.0220 |
| html-browser-html600 | 178/192 | 1.0599 | 1.0668 | 1.0688 | 0.2393 | 0.9801 |
| xml-wasm-sitemap600 | 174/192 | 1.0261 | 1.0292 | 1.0271 | 1.0000 | 1.0052 |
| xml-wasm-svg300 | 184/192 | 1.0121 | 1.0390 | 1.0537 | 0.3555 | 1.0039 |
| xml-native-sitemap600 | 178/192 | 1.0012 | 1.0135 | 1.0182 | 1.0000 | 0.9870 |
| xml-native-svg300 | 172/192 | 1.0026 | 0.9796 | 0.9520 | 1.0000 | 1.0077 |
| xml-browser-sitemap600 | 176/192 | 1.0267 | 1.0100 | 1.0065 | 1.0000 | 0.9986 |
| xml-browser-svg300 | 176/192 | 0.9868 | 1.0256 | 1.0934 | 1.0000 | 0.9904 |
| json-native-real | 178/192 | 1.0011 | 1.0091 | 1.0261 | 1.0000 | 0.9958 |
| json-native-synthetic | 160/192 | 1.0409 | 1.0477 | 1.0718 | 0.3555 | 1.0118 |
| json-wasm-real | 162/192 | 0.9909 | 1.0034 | 1.0078 | 1.0000 | 0.9895 |
| json-wasm-synthetic | 148/192 | 1.0073 | 0.9660 | 0.9310 | 1.0000 | 0.9891 |

Pooled HTML600 p90/p95 intervals are **1.0574–1.1285 / 1.0626–1.1437**;
tail controls are 0.9996/1.0161 and all twelve group medians improve. This supports
the Wasm writer's workload-specific **7.8%/10.6% lower p90/p95 elapsed time**.
Browser HTML120 has adjusted support but drifting p90/p95 controls
(1.0666/1.0744); it is a portable entry under Node, not a browser-engine result.

Native HTML600 p95 is unfavorable, with interval 0.8829–1.0386 and control drift,
so native keeps its prior writer. XML-name and JSON-span variants lack adjusted
primary support and are excluded. Their work reductions and favorable secondary
estimates do not establish elapsed improvements.

## Selected runtime in the original scope

The selected combination was compared with published 0.1.0, the preceding
candidate and identical current code across eight native, eight pooled-Wasm and
four portable-entry panels. All 240 measured workers complete. Twelve fresh
processes per panel each contain eight mirrored four-role blocks; independent
module graphs and rotated orders separate the roles. The control is
current/identical current, unlike the preceding isolated trial's before control.

The probe filter retains **9,624/15,360 batches (62.7%)**. Ten panels meet the
eight-group/128-batch minimum, and sixteen have valid raw/filtered median controls.
**Six median screens pass, one fails and thirteen are inconclusive; none meets
every median and tail criterion.** These are 3% practical median screens.

| Panel | Retained batches/role | Median release / before | p90 release / before | p95 release / before | Median control | Median screen |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| wasm-html120 | 130/192 | 1.0496 / 1.0004 | 1.0306 / 1.0293 | 1.0163 / 1.0214 | 0.9695 | Control drift |
| browser-html120 | 116/192 | 1.0199 / 1.0012 | 1.0099 / 0.9673 | 1.0374 / 0.9448 | 0.9792 | Low retention |
| wasm-sitemap600 | 116/192 | 1.0220 / 0.9725 | 0.9821 / 0.9866 | 1.0258 / 0.9796 | 1.0032 | Low retention |
| wasm-svg300 | 132/192 | 1.0293 / 1.0015 | 0.9832 / 1.0018 | 1.0159 / 1.1009 | 1.0187 | Pass |
| native-html120 | 130/192 | 1.0026 / 0.9689 | 0.9712 / 0.9660 | 1.0213 / 0.9950 | 0.9869 | Before fails |
| wasm-html600 | 134/192 | 1.0456 / 1.0401 | 1.0191 / 1.0201 | 1.0103 / 1.0233 | 1.0123 | Pass |
| wasm-getpose | 106/192 | 1.0552 / 1.0240 | 1.0854 / 1.0324 | 1.0850 / 0.9964 | 1.0011 | Low retention |
| wasm-relative-colors | 44/192 | 1.0856 / 1.0362 | 1.1389 / 1.0345 | 1.0800 / 0.9699 | 0.9977 | Low retention |
| wasm-template | 74/192 | 1.0408 / 1.0046 | 1.0170 / 1.0109 | 0.9853 / 1.0516 | 0.9911 | Low retention |
| wasm-sitemap-pipeline | 120/192 | 1.0728 / 1.0425 | 1.0840 / 1.0735 | 1.0112 / 1.0167 | 0.9484 | Low retention |
| native-html600 | 154/192 | 1.0470 / 1.0108 | 1.1070 / 1.0343 | 1.0567 / 0.9924 | 0.9410 | Control drift |
| native-sitemap600 | 130/192 | 1.0228 / 1.0010 | 1.0773 / 1.0125 | 1.0603 / 0.9637 | 0.9983 | Pass |
| native-svg300 | 152/192 | 0.9807 / 0.9932 | 0.9838 / 0.9888 | 0.9779 / 0.9942 | 1.0092 | Pass |
| native-getpose | 80/192 | 1.0486 / 1.0280 | 1.0407 / 1.0557 | 1.0192 / 1.0853 | 0.9932 | Low retention |
| native-relative-colors | 150/192 | 1.0524 / 0.9852 | 1.0417 / 0.9635 | 1.0352 / 0.9795 | 1.0307 | Control drift |
| native-template | 152/192 | 1.0623 / 1.0705 | 1.1350 / 1.1161 | 1.0527 / 1.0353 | 1.0108 | Pass |
| native-sitemap-pipeline | 122/192 | 1.0341 / 1.0311 | 1.1235 / 1.0460 | 1.1097 / 1.0989 | 1.0056 | Low retention |
| browser-html600 | 108/192 | 1.0856 / 1.0218 | 1.1492 / 1.0543 | 1.1158 / 1.0113 | 1.0269 | Low retention |
| browser-sitemap600 | 126/192 | 1.0057 / 0.9899 | 0.9717 / 0.9899 | 1.0174 / 0.9916 | 0.9907 | Low retention |
| browser-svg300 | 130/192 | 1.0362 / 1.0093 | 1.0041 / 1.0513 | 0.9285 / 0.9740 | 0.9931 | Pass |

Native HTML120 fails before/current: raw/filtered 0.9693/0.9689 with valid
0.9851/0.9869 controls and 130 retained batches per role. Its filtered median
interval is 0.9523–0.9840. This is a scoped failure, not a precise universal
regression estimate. Pooled HTML600's release/current p90 interval
0.9691–1.0655 and drifting tail controls do not independently reproduce the
isolated gain. Browser SVG's unfavorable p95 ratio 0.9285 has interval
0.8609–1.0411 and control 0.9524. No panel was extended to obtain a pass.

## Selected writer on the broader corpus

A separate comparison of the Wasm writer covers 44 successful seeded inputs and
48 real response/error pages. Common benchmark-only heap limits are 96/4 MiB;
ordinary GC remains included. These results stay separate from the original trial.

The seeded panel retains 172/192 batches per role, with controls inside 3%.
p90/p95 time falls **4.2%/4.5%**; p90 ratio **1.0433**, 95% interval
**1.0059–1.0749**, adjusted p **0.0313**. Real-page timing remains incomplete
after a resource guard and supplies no supported tail improvement.

## Later isolated trials

All four follow-ups preserve twenty original regression panels and add native/pool
real/seeded corpus panels. They use twelve fresh processes and eight mirrored
blocks per panel, shorter authored batches (eight HTML120, two HTML600 or sixteen
XML/SVG replays), and one full consumer replay per consumer batch. Corpus timers
sum each document's DOM work through disposal; verification and release of results
occur between timers. Common heap limits remain 128/4 MiB for original panels
and 96/4 MiB for corpora. Ordinary GC/JIT, 3% screens, independent probe filtering,
fixed resource/load limits and all unsuccessful observations remain included.

### Isolated attribute validator with shorter batches

Hoisting the existing non-global RegExp reduces sampled authored JavaScript
allocation by 13–15%, while corpus totals stay within 0.6%. All 24 timing panels
complete: **19 median passes, five inconclusive**. Median controls qualify in
23 panels; p90/p95 controls qualify in only 12/9. No declared primary gain
qualifies, so the validator is not selected. Allocation savings alone are not
elapsed-performance evidence.

### Raw node-kind cache

The cache avoids repeated corpus observations. **18 median screens pass and six
are inconclusive**, including a pooled real-page resource stop. Pooled seeded
p90 includes parity and its four-test Holm p is **0.126953125**. No primary gain
qualifies; the cache is not selected.

### XML name and attribute spans

All 288 processes complete without a resource stop: **18 median passes and six
insufficient-data panels**. Median controls qualify throughout, but p90/p95
controls qualify in only 15/6 panels. Pooled SVG p90 is **1.0490**
(0.9865–1.0980), six-test Holm p **0.2197265625**. No primary gain qualifies;
the span optimization is not selected. The independent raw-XML quote correction
passes correctness/resource checks and is retained.

### XML attribute atoms

The last candidate uses existing interned-name/value comparisons instead of
restarting the general evaluator for XML attribute atoms. Seeded-corpus executed
Wasm instructions fall 6.882%; real-corpus counts rise 0.133%. Original workload
counts are unchanged. These are work counts, not elapsed speedups.

Of 288 planned processes, **284 complete, one is partial and three are unstarted**
after the pooled real-page resource guard. Its completed blocks and partial block
remain recorded; no replacement samples are added. The filter retains
13,264/17,520 recorded batches for complete-process estimates. There are
**17 median passes, seven inconclusive panels and no valid median failures**.
Median/p90/p95 controls qualify in 23/8/9 panels. Candidate correctness and
resource qualification passes; this does not override the performance decision.

Four primary p90 hypotheses cover native/pool real/seeded corpora, with exact
process-label swaps and Holm correction. Selection requires all twelve processes,
sufficient retained samples, valid controls and supported primary improvement.
p95 remains secondary. Unavailable hypotheses receive p=1 and stay in the family.

| Primary panel | Before p90 (95% interval) | Before p95 (95% interval) | Four-test Holm p | Result |
|---|---|---|---:|---|
| native-corpus-real | 1.0228 [0.9907, 1.0536] | 1.0251 [0.9581, 1.0578] | 0.203125 | No supported gain |
| native-corpus-synthetic | 1.0603 [0.9994, 1.1157] | 1.0280 [0.9799, 1.1117] | 1 | Unavailable for selection |
| wasm-corpus-real | 0.9848 [0.9427, 1.1084] | 1.0551 [0.9271, 1.1196] | 1 | Unavailable for selection |
| wasm-corpus-synthetic | 1.0637 [1.0046, 1.1193] | 1.0893 [1.0062, 1.1629] | 0.203125 | No supported gain |

Pooled seeded inputs have median **1.0575**, p90 **1.063735**
(1.004600–1.119325) and p95 **1.089262** (1.006233–1.162883), with valid
controls, 136/192 retained batches per role and ten improving process medians.
The exact primary p is **208/4096 = 0.05078125**; four-test Holm gives
**0.203125**. Favorable intervals and secondary estimates do not override that
failed test. Neither backend selects the optimization.

The other inconclusive results are pooled HTML120 (control 1.0333), pooled
getPose/relative-colors/template (112/36/100 retained batches per role), native
getPose (120), native seeded (124) and pooled real (eight complete processes,
118 retained batches). Unfavorable tails include native HTML120 p95 0.9608
with a broad 0.8596–1.0906 interval, native relative-colors p90 0.9626 and portable
SVG p90/p95 0.9615/0.9527; the latter two panels have drifting tail controls.
Independent reconstruction verifies estimates, intervals, filters and decisions.
The added XML-selector and Unicode allocation-failure/retry tests are retained.

## Earlier regression and rejected-trial record

These separate protocols retain their original 2% or 3% rules. Passing counts
from one trial cannot qualify another candidate or erase a previous failure.

| Trial | Outcome and limit |
|---|---|
| Input descriptor | HTML120 release ratio 0.9736, control 0.9996, all 12 blocks retained: valid failure |
| Constructor helper | Native SVG before/after 0.9578, control 1.0168, all 12 retained: valid failure |
| Scalar queue copy | HTML120 passes; HTML600 release 0.9694, control 1.0099: valid failure |
| Proxy numeric-key guard | Six initial passes, ten incomplete/inconclusive; confirmation fails pooled HTML120 against 0.1.0 |
| Earlier hoisted validator | Four passes, eleven incomplete/inconclusive, one valid failure |
| Distinct sibling roots | Removes a query hotspot; eight passes, four failures, four inconclusive controls |
| General root index | Correctness passes; first twenty-panel screen has one pass and nineteen inconclusive results |
| Inline ASCII whitespace | Five passes, six failures, nine inconclusive; rejected |
| Class operands | Six passes, one failure, thirteen inconclusive; browser HTML120 release 0.9643/control 0.9916; removed |
| Portable ASCII decoder | No timing samples before stops; sampled allocation about 23% higher; removed |
| Early HTML span writer | Operation count falls about 7%; both prerequisite controls invalid and eighteen panels pending; later isolated selection is separate |
| Bounded XML-name comparison | Sitemap passes; SVG control invalid and eighteen panels pending; later isolated trial supplies no adjusted support |
| XML ASCII escape precheck | Sitemap/SVG operation counts rise 1.09%/0.65%; removed before timing |
| Predicate cache | Calls fall 30.6%, but only one block retained and controls fail; no timing acceptance |
| Text/input transfer variants | Several scoped passes, but text/validator regressions and incomplete consumer/control panels prevent acceptance |

### Query-context regression investigation

The original candidate reduces HTML600 root-membership checks from 1,619,700 to
2,400. Correctness and sanitizers pass, but the first six-panel screen has five
inconclusive controls and a saved-MDN pipeline failure (0.9196 release/candidate,
control 0.9850). Aligned warmups/probe repair do not resolve all controls.
A complete quiet HTML120 follow-up fails at 0.9678/control 1.0173, despite a
1.0545 improvement over the preceding code. Work counts do not erase this gap.

### Broader corpus and historical lead trials

The [96-input corpus](../testing.md#broader-corpus-follow-up) exposes structural
selector and template-root errors, with reduced regressions retained. Until
traversal fixes preserve repeated callback visits, visit indices, filtering before
deduplication and the original selection returned by `end()`. Set-based until
deduplication then fails a short native real-page screen. JSON spans have two
short numerical passes and two inconclusive panels. Neither trial is selected.

### Reserved window confirmation

Two prerequisite screens and a fixed-seed diagnostic leave invalid controls.
A subsequent fixed twenty-panel comparison has **seven passes, two failures,
nine invalid controls and two deadline stops**. Native SVG and native template
fail before/candidate checks; both relative-colors panels remain incomplete.
All 224 completed blocks are quiet; 222 survive filtering. Untimed output
equality checks on failed cases establish correctness, not timing acceptance.

## Structural and allocation findings

The source review began at published checkpoint `daa35b5`. Consumer profiles show
substantial URL-processing cost outside GroveDOM; within it, repeated predicates
and named attributes dominate fragment parsing. The five-case panel's ordinary
queries have one root, so wide/deep-tree costs require separate diagnostics.

| Finding | Consequence |
|---|---|
| 32/64 CSS-plan entries both give 81 hits and 3,198 misses | Keep 32; a larger cache adds comparisons with little reuse |
| Short ASCII input prototypes halve most Wasm input crossings | Counts alone do not justify promotion |
| First/last child materializes all child IDs; containment walks ancestors | Scalar axes/ancestry are future workload-dependent opportunities |
| Overlapping until walks repeat callbacks and linear membership tests | Any faster deduplication must preserve callback order and mutations |
| JSON spans reduce a 4 KiB snapshot's writes from 4,113 to nine | Broader timing still supplies no accepted primary gain |
| Joined attribute strings retain about 8 MiB through tiny saved slices | Snapshot lifetime costs matter alongside allocation counts |

Native ticks and instrumented shares are attribution diagnostics, not actual
retired core cycles or whole-pipeline speedups. Independent profiler durations
are never used as paired speedups. Preserve handles, detached-node lifetimes,
selection snapshots, callback order and disposal when reducing work.

Clang analysis found two possible-null paths dependent on selector/tree
invariants; targeted checks reproduced no reachable defect. This is not a blanket
analyzer-clean or memory-safety proof. The regex audit hardened overlapping
release-pagination rescans and recursive positional-selector rescans; regressions
and correctness checks pass, while ordinary timing controls remain inconclusive.
See [compatibility limits](../compatibility.md) and [testing](../testing.md).
