# Proven kernel work reductions

The 0.1.4 development source removes three redundant operations from the native
and Wasm kernel:

- Flat relative `:has()` compounds with a child, adjacent-sibling or
  following-sibling axis inspect only that axis. Nested functions, selector
  chains and recursion-limit behavior retain the original traversal.
- Newly cloned nodes and newly parsed fragment children skip the insertion
  ancestor walk. Existing node moves still check for cycles, preserving partial
  effects, errors, identity and insertion order.
- XML entity decoding initializes scratch output only after recognizing a
  reference. Unchanged text and attributes use the existing immediate-copy
  ownership path. Named/numeric decoding and malformed-reference handling stay
  the same; existing scratch capacity is not shrunk.

These changes add no persistent index or cache. JavaScript, API declarations
and package versions are unchanged. The reference is commit `d2cd72a`; matching
Clang 19 O3/ThinLTO builds use the same reviewed Lexbor and WASI inputs. The
candidate Wasm is 842,406 bytes versus 841,529 for that reference build; native
is 1,368,032 versus 1,367,232. These are private qualification artifacts, not a
newly published release or a comparison with a differently built release binary.

The [40 relative-selector cases](../../test/relative-has-pruning.test.mjs) and
[72 insertion/entity cases](../../test/fresh-insertion-entity.test.mjs) pass on
both the unchanged reference and combined candidate. With all 85 existing test
files, qualification covers **87 files and 2,864 cases per backend** on Node
24.18.0: pooled Wasm has **2,813 passes and 51 skips**, native **2,801 and 63**,
with no final failures, cancellations or TODOs. The same new cases also pass
on global/per-document Wasm heaps and the portable byte path.

All 69 assembled package files match their sources and selected binaries.
Node, browser and native package entries pass their 76 contract cases each,
including four concurrently initialized package workers. Normal and fallback
Node VM browser checks each pass the 16-module graph, release contracts and
810 conformance cases with 35 skips. This checks private assembled packages;
it is not a fresh npm installation, actual-browser or current-consumer pass.

Checks use 64/4 MiB V8 limits, 32 MiB worker old space, JIT, a 45-second deadline
and a serialized 192 MiB sampled RSS stop. The combined per-document-heap test
process was stopped at 211,152 KiB. Partitioning the same 112 cases into four
28-case processes passes with peaks of 102,988–106,544 KiB. The original stopped
run remains part of the evidence. Successful Node checks peak at 177,768 KiB;
sampling is not a hard cap or a sustained-memory qualification. Two preparation
failures are also retained: a corrected Cheerio return-value expectation and
missing helper files in the initial private package fixture.

Earlier relative-`:has()` native miss-case measurements favored axis pruning
at candidate/reference medians 0.483, 0.052, 0.257 and 0.020. Immediate-hit
order medians 1.004 and 1.031 remain unfavorable. Those closed, best-effort
measurements stay separate from this integration. Fresh insertion and unchanged
entity handling are selected for their small, proven work reductions. No new
elapsed comparison, combined speedup or general non-regression is established.

A separate bounded diagnostic executes current application DOM functions with
fixture URL/resource hooks on two retained current documentation pages and two
historical pages. It includes five traces, two CPU captures and two allocation
captures. All 68 output records agree. This is an application-module slice,
not a complete crawler or a replay of its production hook configuration.

The remaining candidates do not justify another timing panel on these inputs:

| Candidate | Observed work | Disposition |
| --- | --- | --- |
| Tag-first compatibility matching | No relevant matcher entries | Wait for an applicable workload |
| Second attribute guard | 5,784 checks; 129 absent, 5,655 present | Defer the blanket policy; most checks add work |
| Streaming `:contains()` | No `:contains()` entries | Wait for an applicable workload |
| Wide attribute indexes | Nine parser cases; maximum XML width 6 and normalized foreign width 9; no duplicates or index-admitted comparisons | Wait for real wide lists |
| Bounded custom nth-of matching | No custom nth-of entries | Wait for an applicable workload |
| Lazy/compact callback results | Four callback filters with empty inputs and zero result backing | Wait for nonempty, retained results |

The second-guard trace has a narrower missing-name lead: 20 queries perform
10,715 guard-match entries even though a necessary attribute name is absent
from the document. They cause only three full selector validations, all on a
historical page; the two current pages contribute none. This requires a
separate preparation design with mutation-safe name resolution, not blanket
per-node checks. It is not selected for timing or integration here.

Ordinary selector filters are outside the callback-result proposal. The 148
observed calls consume 42,838 IDs and return 1,987, with exactly 7,948 result
backing bytes and no unused result capacity. The largest selection has 727
distinct IDs. Finite weak-reference observations after disposal and extra GC
turns do not establish real consumer lifetimes or a memory plateau.

The CPU captures retain only 99 and 91 samples; they cannot establish stable
fine-grained weights. Allocation captures retain 583 and 557 samples, with
tree/sample attribution discrepancies kept explicitly. Native diagnostic
scopes include observer cost. None of these profiles is a candidate speedup.
No capture was extended to seek a favorable result. Namespace-history retention
still needs a separate identity/lifetime fix. Keep Cheerio as the consumer
default and `loadFast` opt-in while downstream qualification remains open.
