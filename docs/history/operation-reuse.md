# Style and literal-wrapper reuse

The 0.1.4 development source avoids repeated parsing within two operations:

- `css(map)` reuses the parsed style of one node between properties. It still
  reads and writes the visible attribute for every property. Changed attributes,
  declarations that do not round-trip, and inherited accessors force another
  parse. The accessor check includes setters installed during value coercion.
- `wrap(literalMarkup)` parses a detached template once, clones it for earlier
  occurrences and uses the original at the final position. Selector wrappers
  continue to observe each tree change; callback wrappers keep their existing path.

Both selection modes retain node occurrences, key snapshots, identity, callback
arguments and ordering, partial effects and disposal boundaries. There is no
persistent cache or API/declaration/binary change. An inherited style accessor
can expose the parsed object to later user code; the implementation deliberately
reparses after that access so later mutations of the old object cannot alter
the current style.

## Correctness

Node 24.18.0 runs all 84 existing test files separately plus the
[120 new regression cases](../../test/operation-reuse.test.mjs): **85 files and
2,752 cases per backend**. Pooled Wasm passes **2,701 with 51 exclusions**;
native passes **2,689 with 63 exclusions**. There are no final failures,
cancellations or TODOs. The corrected regressions also pass on the unmodified
source reference. Inherited-accessor cases assert GroveDOM's established
coercion behavior; they do not add a Cheerio object-coercion parity claim.

The same 120 cases pass on global/per-document heaps and the portable byte path.
The two selected differential contracts pass 288 comparisons across Wasm, native
and portable decoding. All 150 preflight batches match the saved method/full
output oracles. Public Node/native entries each pass 76 contract cases. Normal
and fallback Node VM browser checks each pass the 16-module graph, the expanded
release contract and 810 selected cases with 35 exclusions. These are scoped
Node checks; current actual-browser and installed-consumer qualification remain
separate.

The original 130,000-field native form case retains its size and runs without
an extra test coordinator. Worker checks keep four concurrent workers and assert
the 32 MiB old-space budget in each isolate. Other runs use 64/4 MiB V8, JIT,
45 seconds and a serialized 192 MiB sampled process-group RSS stop. The selected
qualification peaks at **170,852 KiB** with no RSS stop. Sampling
is not a hard cap or sustained-memory qualification.

The 19 runtime JS files grow by **1,671 bytes**; their
concatenated gzip level-9 diagnostic grows by **492 bytes**.
This is source-size accounting, not package transfer size. The retained Wasm
binary remains 841,374 bytes, and native/Wasm fingerprints are unchanged.

## Combined measurements

The reference is source `0e5e92a`, with the existing compatible and fast modes.
The final corrected implementation has its own fixed panel; the first
implementation's complete panel remains separate after review found the inherited
accessor issue. Neither panel is pooled with the preceding candidate survey.

Node 24.18.0 pooled Wasm runs **72 paired processes, 3,200 timed batches and
1,600 warmup batches** over all eleven style/wrapper method cases and fourteen
full workloads. Each process has independent runtime/caller graphs, four warmups
per variant and four mirrored groups. Candidate/reference and identical
reference/control comparisons use both import orders and both modes. All timed
outputs match. Paired results retain every group, with no filtering, forced GC
or control normalization. Ranges are observed bounds, not confidence intervals.

Method timers exclude document/selection preparation, output hashing and disposal;
they include mutations, required callbacks, allocation and the final queue flush.
Full shared/saved/corpus/nested-wrap replays include loading, queries, edits,
serialization and disposal. Retained-read fixtures keep their original setup
exclusions. The saved pages and 44-input corpus do not establish production weights.

The host admission record is **best effort** after
attempt 4, using the fixed 1/3/5/5-minute retry schedule.
Admission checks three one-second CPU/sibling samples; it cannot ensure quiet
conditions throughout the run. **29 of 50 case/mode rows** meet the
control-noise diagnostic. Full-workload non-regression and a general speedup
remain unproven; unfavorable results below remain part of the evidence.

Candidate/reference elapsed ratios below one favor the change. Controls are
diagnostics, never correction factors. Both import-order medians are retained.

Sixteen-property style maps have medians **0.410–0.478**, with all eight groups
favorable on both saved pages and modes. Literal wrapping has **0.420–0.472**
medians, with seven or eight favorable groups per case. These support the scoped
changes; noisy controls prevent precise general speedup estimates. Other paths
retain unfavorable results: fast string CSS on Canvas is **1.216** (control
**0.967**), and compatible callback wrapping on Array is **1.198** (control
**0.985**). The full-workload review trigger is not met, which is not proof of
general non-regression.

| Scope | Case | Mode | Candidate median [range] | Favorable | Control | Candidate import orders |
| --- | --- | --- | ---: | ---: | ---: | --- |
| full | balanced-44 | compatible | 0.988 [0.898, 1.071] | 4/8 | 1.029 | 1.009 / 0.979 |
| full | balanced-44 | fast | 1.017 [0.897, 1.124] | 3/8 | 0.976 | 1.017 / 0.992 |
| full | first-read-6000 | compatible | 0.935 [0.624, 1.618] | 6/8 | 1.320 | 0.877 / 1.026 |
| full | raw-children-128 | compatible | 1.182 [0.387, 2.194] | 3/8 | 0.837 | 1.017 / 1.221 |
| full | text-properties | compatible | 1.110 [0.692, 1.614] | 3/8 | 1.141 | 0.955 / 1.202 |
| full | nested-wrapping | compatible | 0.736 [0.410, 0.930] | 8/8 | 1.004 | 0.669 / 0.736 |
| full | first-read-6000 | fast | 1.224 [0.490, 2.067] | 3/8 | 1.139 | 1.393 / 1.104 |
| full | raw-children-128 | fast | 1.226 [0.550, 1.482] | 3/8 | 1.196 | 0.880 / 1.377 |
| full | text-properties | fast | 0.886 [0.541, 1.436] | 6/8 | 0.783 | 1.048 / 0.882 |
| full | nested-wrapping | fast | 0.773 [0.562, 1.221] | 7/8 | 1.118 | 0.797 / 0.753 |
| full | saved-canvas | compatible | 0.939 [0.444, 1.335] | 5/8 | 0.981 | 0.877 / 1.132 |
| full | saved-pixel | compatible | 0.777 [0.541, 1.120] | 6/8 | 0.837 | 0.686 / 0.976 |
| full | saved-array | compatible | 0.995 [0.729, 1.183] | 5/8 | 0.917 | 0.987 / 1.039 |
| full | saved-canvas | fast | 1.209 [0.800, 1.827] | 3/8 | 0.874 | 1.209 / 1.118 |
| full | saved-pixel | fast | 0.976 [0.669, 1.640] | 4/8 | 1.179 | 1.368 / 0.743 |
| full | saved-array | fast | 0.886 [0.733, 1.665] | 5/8 | 1.079 | 1.026 / 0.872 |
| full | selectors-sparse | compatible | 0.886 [0.642, 1.094] | 5/8 | 1.000 | 0.978 / 0.825 |
| full | selectors-dense | compatible | 1.100 [0.729, 1.313] | 3/8 | 1.279 | 0.988 / 1.164 |
| full | selectors-sparse | fast | 0.970 [0.841, 1.066] | 5/8 | 1.002 | 1.020 / 0.942 |
| full | selectors-dense | fast | 1.135 [0.793, 1.780] | 3/8 | 1.068 | 1.250 / 1.024 |
| full | articles-120 | compatible | 0.939 [0.830, 1.119] | 5/8 | 0.956 | 0.928 / 0.961 |
| full | articles-600 | compatible | 0.898 [0.855, 1.105] | 7/8 | 0.924 | 0.870 / 0.925 |
| full | sitemap-600 | compatible | 0.999 [0.702, 1.089] | 5/8 | 0.966 | 0.999 / 1.024 |
| full | svg-300 | compatible | 1.048 [0.777, 1.446] | 2/8 | 1.001 | 1.048 / 1.195 |
| full | articles-120 | fast | 0.969 [0.863, 1.037] | 5/8 | 0.952 | 0.933 / 1.016 |
| full | articles-600 | fast | 1.080 [0.884, 1.318] | 2/8 | 0.934 | 1.173 / 0.958 |
| full | sitemap-600 | fast | 0.955 [0.604, 1.432] | 5/8 | 0.984 | 0.993 / 0.925 |
| full | svg-300 | fast | 1.050 [0.780, 1.373] | 2/8 | 1.006 | 1.050 / 1.117 |
| methods | old-css-map-canvas | compatible | 0.848 [0.707, 1.533] | 6/8 | 1.037 | 0.791 / 0.856 |
| methods | old-css-map-array | compatible | 0.951 [0.729, 1.823] | 5/8 | 1.060 | 1.484 / 0.894 |
| methods | old-css-string-canvas | compatible | 0.974 [0.542, 2.331] | 4/8 | 0.817 | 0.993 / 0.961 |
| methods | old-css-map-canvas | fast | 0.827 [0.591, 1.386] | 6/8 | 1.058 | 0.710 / 1.116 |
| methods | old-css-map-array | fast | 0.837 [0.588, 2.141] | 6/8 | 1.031 | 0.786 / 1.019 |
| methods | old-css-string-canvas | fast | 1.216 [0.760, 1.633] | 1/8 | 0.967 | 1.107 / 1.382 |
| methods | old-css-string-array | compatible | 1.024 [0.631, 1.276] | 3/8 | 1.009 | 1.130 / 1.003 |
| methods | custom-css-16-canvas | compatible | 0.478 [0.418, 0.573] | 8/8 | 0.978 | 0.527 / 0.443 |
| methods | custom-css-16-array | compatible | 0.474 [0.354, 0.538] | 8/8 | 0.976 | 0.517 / 0.390 |
| methods | old-css-string-array | fast | 1.116 [0.521, 1.335] | 4/8 | 1.020 | 1.306 / 0.725 |
| methods | custom-css-16-canvas | fast | 0.431 [0.341, 0.498] | 8/8 | 0.973 | 0.424 / 0.442 |
| methods | custom-css-16-array | fast | 0.410 [0.392, 0.719] | 8/8 | 1.051 | 0.458 / 0.410 |
| methods | old-wrap-string-canvas | compatible | 0.420 [0.260, 0.668] | 8/8 | 0.985 | 0.420 / 0.496 |
| methods | old-wrap-string-array | compatible | 0.462 [0.186, 1.236] | 7/8 | 0.889 | 0.552 / 0.379 |
| methods | old-wrap-callback-canvas | compatible | 0.857 [0.536, 1.611] | 6/8 | 0.955 | 0.967 / 0.664 |
| methods | old-wrap-string-canvas | fast | 0.472 [0.259, 1.067] | 7/8 | 1.007 | 0.364 / 0.711 |
| methods | old-wrap-string-array | fast | 0.431 [0.282, 1.295] | 7/8 | 0.647 | 0.392 / 0.501 |
| methods | old-wrap-callback-canvas | fast | 0.767 [0.381, 2.081] | 6/8 | 0.996 | 0.750 / 0.888 |
| methods | old-wrap-callback-array | compatible | 1.198 [0.749, 1.490] | 2/8 | 0.985 | 1.000 / 1.287 |
| methods | custom-wrap-many-canvas | compatible | 0.441 [0.281, 0.586] | 8/8 | 0.923 | 0.422 / 0.441 |
| methods | old-wrap-callback-array | fast | 1.038 [0.586, 2.011] | 4/8 | 0.881 | 0.787 / 1.583 |
| methods | custom-wrap-many-canvas | fast | 0.491 [0.289, 0.974] | 8/8 | 1.097 | 0.408 / 0.874 |

Offline CI uses reference/current ratios, so higher favors current.

| Case | Current | Reference | Raw | Filtered | Complete / kept blocks |
| --- | --- | --- | ---: | ---: | ---: |
| articles-120 | candidate | reference | 1.034 | 1.034 | 9 / 9 |
| articles-120 | candidate | ci-control | 1.173 | 1.162 | 9 / 8 |
| articles-120 | candidate | cheerio | 4.863 | 4.863 | 9 / 9 |
| articles-120 | candidate | slim | 3.019 | 3.019 | 9 / 9 |
| articles-120 | candidate-fast | reference-fast | 1.040 | 1.040 | 9 / 9 |
| articles-120 | candidate-fast | ci-control-fast | 1.002 | 1.002 | 9 / 9 |
| articles-120 | candidate-fast | cheerio | 5.044 | 5.042 | 9 / 8 |
| articles-120 | candidate-fast | slim | 3.224 | 3.224 | 9 / 9 |
| articles-120 | candidate-fast | candidate | 1.040 | 1.040 | 9 / 9 |
| articles-600 | candidate | reference | 1.110 | 1.110 | 3 / 3 |
| articles-600 | candidate | ci-control | 0.760 | 0.888 | 3 / 2 |
| articles-600 | candidate | cheerio | 8.125 | 8.160 | 3 / 2 |
| articles-600 | candidate | slim | 4.958 | 4.966 | 4 / 1 |
| articles-600 | candidate-fast | reference-fast | 1.001 | 1.002 | 4 / 2 |
| articles-600 | candidate-fast | ci-control-fast | 1.022 | 1.022 | 4 / 4 |
| articles-600 | candidate-fast | cheerio | 8.564 | 7.988 | 3 / 1 |
| articles-600 | candidate-fast | slim | 5.992 | 5.578 | 3 / 2 |
| articles-600 | candidate-fast | candidate | 1.002 | 1.002 | 3 / 3 |
| sitemap-600 | candidate | reference | 1.007 | n/a | 5 / 0 |
| sitemap-600 | candidate | ci-control | 1.097 | 0.887 | 5 / 1 |
| sitemap-600 | candidate | cheerio | 5.140 | 5.140 | 5 / 1 |
| sitemap-600 | candidate | slim | 6.113 | n/a | 5 / 0 |
| sitemap-600 | candidate-fast | reference-fast | 0.981 | n/a | 5 / 0 |
| sitemap-600 | candidate-fast | ci-control-fast | 1.090 | 1.162 | 6 / 2 |
| sitemap-600 | candidate-fast | cheerio | 5.267 | 6.656 | 5 / 1 |
| sitemap-600 | candidate-fast | slim | 5.373 | 5.314 | 5 / 1 |
| sitemap-600 | candidate-fast | candidate | 1.146 | 1.110 | 5 / 1 |
| svg-300 | candidate | reference | 1.211 | 1.211 | 9 / 7 |
| svg-300 | candidate | ci-control | 1.088 | 1.088 | 9 / 9 |
| svg-300 | candidate | cheerio | 3.260 | 3.260 | 9 / 9 |
| svg-300 | candidate | slim | 3.333 | 3.333 | 9 / 9 |
| svg-300 | candidate-fast | reference-fast | 1.120 | 1.074 | 9 / 6 |
| svg-300 | candidate-fast | ci-control-fast | 1.093 | 1.037 | 9 / 6 |
| svg-300 | candidate-fast | cheerio | 2.529 | 2.881 | 9 / 8 |
| svg-300 | candidate-fast | slim | 2.900 | 2.900 | 8 / 4 |
| svg-300 | candidate-fast | candidate | 1.301 | 1.301 | 9 / 7 |


The offline CI adapter uses the actual comparison implementation, four authored
cases, 20 warmups per variant and two replays per sample under an eighteen-second
case deadline. Its 36 rows retain **171/237 complete
blocks**, plus 4 incomplete blocks. It checks
3,822 timed replays including partial blocks and
640 warmup replays. Its controls duplicate the corresponding
current mode; `slim` is Cheerio's htmlparser2 configuration. All eight variants
share a process with separate GroveDOM module graphs. Its ratios are
reference/current, the opposite direction from the paired table. This is local
offline evidence, not a new hosted or registry-release comparison.
`n/a` means no complete block passed that row's probe filter; the raw blocks
remain available and are not replaced by a filtered estimate.
Fast SVG remains below the 3× target against both Cheerio configurations in
this panel: filtered ratios are **2.881× / 2.900×**. Earlier release receipts
keep their own source and measurement scope.

Keep the consumer's Cheerio default and `loadFast()` opt-in. The
[complete consumer performance and adoption requirements](../benchmarks.md)
remain open. This fixed qualification is complete; noisy controls do not select
another timing panel.
