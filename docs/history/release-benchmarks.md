# Published release measurements

These reported release CI and browser runs are separate from current development
comparisons. See the [current summary](../benchmarks.md) for readiness.

## 0.1.1 release measurements

Experimental 0.1.1 was released on 2026-10-17 from
[`cb2c8e9`](https://github.com/website-local/grovedom/commit/cb2c8e947864c05e3308c4afe8aa2dfffea4b43a).
These reported summaries cover the release CI run and browser demo runs in
**Firefox 150** and **Chromium 140**, using pooled Wasm and the same four authored
workloads. Ratios retain their supplied precision. Raw per-block samples and
order breakdowns were not supplied for these runs, so the summaries have not
been independently recomputed. They remain separate from the earlier audited CI
run and from controlled local comparisons.

All ratios are reference time divided by GroveDOM time; larger values favor
GroveDOM. Counts show probe-retained / complete blocks. The demo checks output
equality during replay; these timings do not run the full browser correctness
suite or establish a production workload distribution. Separate reported
[correctness-page runs](../testing.md#reported-browser-runs) pass the selected suite
in Firefox 150 and Chromium 140.

### Release CI

The Node CI benchmark selected npm Wasm **0.1.0** before publishing **0.1.1**,
so its released/current labels correctly differ. Cheerio is **1.2.0**.

| Case | Reference / GroveDOM | Raw | Probe-filtered | Kept / complete |
|---|---|---:|---:|---:|
| articles-120 | released Wasm | 1.084× | 1.084× | 49/49 |
| articles-120 | Cheerio default | 3.776× | 3.776× | 48/48 |
| articles-120 | Cheerio htmlparser2 | 2.791× | 2.791× | 48/48 |
| articles-120 | identical Wasm control | 1.012× | 1.012× | 47/48 |
| articles-600 | released Wasm | 1.039× | 1.039× | 48/48 |
| articles-600 | Cheerio default | 6.276× | 6.273× | 47/48 |
| articles-600 | Cheerio htmlparser2 | 4.910× | 4.910× | 48/48 |
| articles-600 | identical Wasm control | 0.993× | 0.993× | 48/48 |
| sitemap-600 | released Wasm | 1.022× | 1.024× | 47/48 |
| sitemap-600 | Cheerio default | 4.530× | 4.530× | 47/48 |
| sitemap-600 | Cheerio htmlparser2 | 4.456× | 4.456× | 48/48 |
| sitemap-600 | identical Wasm control | 1.068× | 1.068× | 48/48 |
| svg-300 | released Wasm | 1.040× | 1.040× | 48/48 |
| svg-300 | Cheerio default | 3.039× | 3.039× | 48/48 |
| svg-300 | Cheerio htmlparser2 | 3.041× | 3.041× | 48/48 |
| svg-300 | identical Wasm control | 1.053× | 1.053× | 48/48 |

The displayed counts retain **765/769** complete blocks. Article ratios favor
0.1.1 in this run. The smaller sitemap/SVG improvements over 0.1.0 remain
inconclusive against controls of 1.068×/1.053×. SVG's 3.039×/3.041× Cheerio
medians have little margin above 3×. An earlier independently audited run at
the same commit reported 2.911×/2.910× for SVG, with a 1.050× control; preserve
that result separately. These summaries do not establish a robust per-case or
full-workload adoption pass.

### Firefox 150

Reported from the hosted 0.1.1 demo. Browser comparisons use Cheerio 1.2.0's
versioned CDN modules; dependency resolution can differ from CI's npm install.

| Case | Reference / GroveDOM | Raw | Probe-filtered | Kept / complete |
|---|---|---:|---:|---:|
| articles-120 | Cheerio default | 4.80× | 4.80× | 10/10 |
| articles-120 | Cheerio htmlparser2 | 3.62× | 3.62× | 10/10 |
| articles-120 | identical Wasm control | 1.03× | 1.03× | 10/10 |
| articles-600 | Cheerio default | 6.20× | 6.20× | 10/10 |
| articles-600 | Cheerio htmlparser2 | 4.59× | 4.61× | 9/10 |
| articles-600 | identical Wasm control | 1.05× | 1.05× | 10/10 |
| sitemap-600 | Cheerio default | 7.06× | 7.15× | 8/9 |
| sitemap-600 | Cheerio htmlparser2 | 6.61× | 6.64× | 8/9 |
| sitemap-600 | identical Wasm control | 1.06× | 1.09× | 8/9 |
| svg-300 | Cheerio default | 5.00× | 5.00× | 10/10 |
| svg-300 | Cheerio htmlparser2 | 5.08× | 5.08× | 10/10 |
| svg-300 | identical Wasm control | 1.11× | 1.10× | 9/10 |

The displayed counts retain **112/117** complete blocks. All four workload
medians exceed 3× against both Cheerio configurations in this report. Raw
controls range from 1.03× to 1.11×, and filtered controls from 1.03× to 1.10×;
these offsets limit precision and are not formal error bars.

### Chromium 140

A separate reported browser-demo run gives smaller relative gains:

| Case | Reference / GroveDOM | Raw | Probe-filtered | Kept / complete |
|---|---|---:|---:|---:|
| articles-120 | Cheerio default | 2.33× | 2.33× | 6/6 |
| articles-120 | Cheerio htmlparser2 | 1.72× | 1.72× | 5/5 |
| articles-120 | identical Wasm control | 1.00× | 1.00× | 5/5 |
| articles-600 | Cheerio default | 3.89× | 3.89× | 5/5 |
| articles-600 | Cheerio htmlparser2 | 2.88× | 2.88× | 5/5 |
| articles-600 | identical Wasm control | 1.02× | 1.01× | 5/6 |
| sitemap-600 | Cheerio default | 2.77× | 2.77× | 6/6 |
| sitemap-600 | Cheerio htmlparser2 | 2.98× | 2.98× | 6/6 |
| sitemap-600 | identical Wasm control | 1.03× | 1.03× | 6/6 |
| svg-300 | Cheerio default | 1.96× | 1.96× | 6/6 |
| svg-300 | Cheerio htmlparser2 | 1.92× | 1.92× | 6/6 |
| svg-300 | identical Wasm control | 1.02× | 1.02× | 6/6 |

The displayed counts retain **67/68** complete blocks. GroveDOM is faster than
both Cheerio configurations in every reported case, but only articles-600
exceeds 3× against Cheerio default. Raw and filtered controls stay within
1.00×–1.03×. These lower ratios remain part of the evidence.

The browser reports do not establish matched host conditions, and their
relative ratios do not measure absolute engine speed. Do not average the two
browsers or divide their ratios by the controls. Browser-wide 3× performance,
broader browser API qualification and production adoption remain unverified.

## 0.1.2 reported CI

Experimental 0.1.2 was released on 2026-10-24 from
[`25faa49`](https://github.com/website-local/grovedom/commit/25faa49448ff783e0736ebcc1a819f169ef5136f).
Both npm packages are published at 0.1.2; the Git tag and deployed demo manifest
identify that commit. Full CI, including its final gate, is reported passing.

The two supplied summaries below use **current 0.1.2, published Wasm 0.1.1 and
Cheerio 1.2.0**, with pooled heaps and the shared browser workload running in CI.
The second report also states that CI passed. Neither table embeds a run ID,
commit or artifact hash; raw timings, order breakdowns and Node versions were
not supplied. Keep the reports separate and retain their displayed precision.
They are not new browser-engine or complete-consumer qualifications.

### First reported run

| Case | Reference/current (paired) | Raw | Probe-filtered | Kept/complete blocks |
| --- | --- | ---: | ---: | ---: |
| articles-120 | released Wasm | 1.019× | 1.019× | 46/46 |
| articles-120 | Cheerio default | 3.876× | 3.876× | 46/46 |
| articles-120 | Cheerio htmlparser2 | 2.873× | 2.873× | 46/46 |
| articles-120 | identical Wasm control | 1.013× | 1.013× | 46/46 |
| articles-600 | released Wasm | 1.065× | 1.065× | 46/46 |
| articles-600 | Cheerio default | 6.123× | 6.123× | 46/46 |
| articles-600 | Cheerio htmlparser2 | 4.951× | 4.951× | 45/45 |
| articles-600 | identical Wasm control | 0.967× | 0.967× | 45/45 |
| sitemap-600 | released Wasm | 1.049× | 1.049× | 45/45 |
| sitemap-600 | Cheerio default | 4.532× | 4.532× | 45/45 |
| sitemap-600 | Cheerio htmlparser2 | 4.458× | 4.458× | 45/45 |
| sitemap-600 | identical Wasm control | 1.040× | 1.040× | 45/45 |
| svg-300 | released Wasm | 1.030× | 1.030× | 45/45 |
| svg-300 | Cheerio default | 2.959× | 2.959× | 46/46 |
| svg-300 | Cheerio htmlparser2 | 2.996× | 2.996× | 46/46 |
| svg-300 | identical Wasm control | 1.042× | 1.042× | 46/46 |

The reported counts retain **729/729** complete blocks. Released/current medians
are 1.019, 1.065, 1.049 and 1.030; identical controls are 1.013, 0.967, 1.040 and
1.042. SVG remains below 3× both Cheerio configurations in this report.

### Later reported run

| Case | Reference/current (paired) | Raw | Probe-filtered | Kept/complete blocks |
| --- | --- | ---: | ---: | ---: |
| articles-120 | released Wasm | 1.024× | 1.024× | 47/47 |
| articles-120 | Cheerio default | 3.833× | 3.833× | 47/47 |
| articles-120 | Cheerio htmlparser2 | 2.864× | 2.864× | 47/47 |
| articles-120 | identical Wasm control | 1.018× | 1.018× | 47/47 |
| articles-600 | released Wasm | 1.014× | 1.014× | 47/47 |
| articles-600 | Cheerio default | 6.355× | 6.355× | 47/47 |
| articles-600 | Cheerio htmlparser2 | 5.027× | 5.027× | 47/47 |
| articles-600 | identical Wasm control | 0.980× | 0.980× | 47/47 |
| sitemap-600 | released Wasm | 1.006× | 1.006× | 47/47 |
| sitemap-600 | Cheerio default | 4.507× | 4.507× | 47/47 |
| sitemap-600 | Cheerio htmlparser2 | 4.378× | 4.378× | 47/47 |
| sitemap-600 | identical Wasm control | 1.061× | 1.061× | 47/47 |
| svg-300 | released Wasm | 1.039× | 1.039× | 47/47 |
| svg-300 | Cheerio default | 3.022× | 3.022× | 46/46 |
| svg-300 | Cheerio htmlparser2 | 2.998× | 2.998× | 47/47 |
| svg-300 | identical Wasm control | 1.044× | 1.044× | 47/47 |

The reported counts retain **751/751** complete blocks. Released/current medians
are 1.024, 1.014, 1.006 and 1.039; identical controls are 1.018, 0.980, 1.061 and
1.044. The sitemap ratio of 1.006 with a 1.061 control does not establish a precise
improvement. SVG is 3.022× default Cheerio and 2.998× htmlparser2, with a 1.044
control; small HTML is below 3× htmlparser2 in both reports.

All released/current medians favor 0.1.2, but control drift limits small gain
claims. Do not normalize by controls, combine the runs or treat these near-threshold
medians as a complete-workload 3× adoption pass. Published-package integration
and representative consumer measurements remain the next qualification work.
