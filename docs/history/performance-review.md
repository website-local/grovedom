# Static and allocation review

This review covers the runtime at `daa35b5`: ESM facade and transport, C kernel,
selector helpers, serialization, ownership and dependency entry points. It combines
source inspection with existing consumer profiles, new operation traces, V8 heap
sampling and authored scaling checks. It does not establish exhaustive coverage
or a new release speedup.

## HTML allocation follow-up

Six separate Node/V8 heap captures cover pooled Wasm at 120/600 articles for
published 0.1.0, the working JSON-span candidate and the private input-descriptor
candidate. Each uses 20 warmups, GC before sampling, 40 replays and a 4 KiB
sampling interval, including objects collected by minor and major GC. Output
hashes match across all three variants at each size. These captures ran under
host load and provide statistical JS allocation attribution, not elapsed gains,
retained memory or Wasm allocation measurements.

Single-ID typed-array creation beneath `each` accounts for approximately 24–25%
of estimated allocation in all six captures; `attr` self allocation contributes
15–16%. Independent exact call tracing finds 240/1,200 `Uint32Array.of` calls in
node construction, plus one root array per replay. Every callback node is passed
to `$(this)`, which consumes its stable IDs: lazy creation alone would avoid none
of these arrays. Sharing a mutable callback array would break retained selection
snapshots. Alternative storage needs separate lifetime and retention analysis.

These costs also exist in 0.1.0 and do not establish a regression cause. Attribute
samples cannot distinguish regex objects from other allocations in that method;
the earlier validator experiment remains allocation evidence, not an accepted
performance fix. No runtime change follows from these captures alone.

An isolated callback-handle prototype replaces one-ID backing buffers with
one-element views of the selection's existing ID array. Source review confirms
that selection index assignment, splice and merge replace storage; focused
checks preserve callback snapshots through those edits and nested callbacks.
Separate allocation captures estimate 6.91/34.51 MB at 120/600 articles, compared
with 7.62/40.65 MB for the working candidate under the same sampling settings.
These are noisy statistical allocation estimates, not speedups or acceptance.

Unbounded sharing was rejected for promotion: after disposal and GC, retaining
one callback node from a 20,000-node query retains the entire 80,000-byte ID
buffer. The current one-ID record does not retain that query buffer. A WeakRef
probe verifies the additional retention; it does not measure total heap usage.
Any future sharing design must bound this cost for both handles and selections,
without moving equivalent allocations into disposal. The private prototype and
its unfavorable retention result remain preserved; no full correctness or
performance qualification is claimed for it.

A second private prototype stores HTML handle IDs in document-owned blocks of
32 slots. Each handle receives an immutable one-element view; slots are never
reused, and disposal clears the document's reference to the latest block.
Retaining one disposed handle and its selection after wrapping 20,000 nodes
keeps one 128-byte block, with the other 624 blocks collected. Sparse documents
pay for unused slots: one wrapped node reserves 128 rather than four backing
bytes, and every document has two additional bookkeeping fields. No ID block
is allocated until an HTML handle is created; XML record behavior is unchanged.

Under the same allocation-capture settings, estimated JS allocation is
6.75/35.11 MB for 120/600 articles, versus 7.62/40.65 MB before. Output hashes
match. This does not establish elapsed improvement or sparse-workload parity.
The prototype passes the 1,795-case suites on pooled Wasm (1,744 passes,
51 skips) and native (1,736 passes, 59 skips), focused shared/fresh heap and
Node 24 checks, portable browser fallback, and both 193-case output/event and
lifecycle replays on each backend. It remains isolated and unqualified by timing;
the native kernel is unchanged.

Exact block tracing confirms eight blocks / 240 views at 120 articles and
38 blocks / 1,200 views at 600; no-handle HTML and the XML sitemap create no
blocks. Separate sparse captures use 2,000 no-handle or one-handle documents,
and 40 XML600 replays. Their sampled totals vary by about −2.5% to +0.3%; these
single captures do not establish sparse allocation or elapsed parity. Heap
sampling also does not fully account for external ArrayBuffer backing storage.

A separate GC lifecycle probe retains 5,000 disposed one-node documents through
their handles. ArrayBuffer growth is 20,000 bytes before and 660,000 bytes with
blocks; after releasing the handles it returns to the pre-probe level in both
processes. Heap-used deltas are approximately 9.05/9.01 MB. These independent
snapshots include runtime bookkeeping, but expose a sparse backing-storage cost
that the heap samples alone miss. `external` includes `arrayBuffers` and must
not be added to it. The block prototype therefore remains a workload-dependent
tradeoff, with no accepted performance result.

## Consumer decisions

Three passes through the five-case offline consumer panel produced the same
outputs and 45 balanced document lifetimes. All 3,756 ordinary queries used one
root. This explains why multi-root and deep-traversal costs were inconspicuous.

| Area | Evidence | Decision |
|---|---|---|
| CSS plan capacity | 32 and 64 entries both give 81 hits / 3,198 misses; simulated key comparisons rise from 47,532 to 87,564 | Keep 32. Even unlimited per-document storage avoids only 78 more misses |
| Short input transfer | Both private ASCII prototypes reduce Wasm input crossings from 67,152 to 33,822 | Pending timing; crossings are not allocator calls |
| Unicode input | Direct-write prototype needs three calls; ASCII-precheck prototype keeps two | Precheck avoids the extra call, but introduces a scan |
| Repeated predicates | Two answers for the last node remove 30.6% of scalar predicate calls | Keep private until hit and miss workloads pass timing controls |
| JS validators | Hoisting two constant regex validators lowers estimated facade allocation from 5.7 to 3.9 MB in separate fixed heap captures | Promising allocation evidence; elapsed benefit unproven |
| Unicode selectors | Authored Latin, Greek, supplementary, token and substring cases match Cheerio; repeated comparisons allocate no new backing storage after warmup | Remaining long substring cost is computation, not per-comparison allocation |

The V8 captures use a 32 KiB sampling interval, include collected objects and
three measured consumer passes after two warmups. They include consumer and
verification work, exclude native arenas/Wasm memory, and are statistical
allocation estimates. URI processing dominates overall sampled allocation.
Do not turn either allocation difference or independent profiler times into a
DOM speedup. The real consumer panel still records zero Unicode-selector fallbacks.

Each of the four prototypes passed the full pooled-Wasm suite, 200 seeded cases
in both execution modes, and all 193 expanded pipeline cases against each of two
preserved consumer snapshots. These repeat the same corpus/seeds across variants;
they are not additional independent inputs. The predicate prototype also passed
the full native suite. Transfer checks cover shared/fresh heaps, growth, stale
views, Unicode boundaries and portable decoding.

The fixed precheck-transfer timing panel stopped before its first measured block.
The separately planned validator panel stopped after one quiet, probe-retained
block: baseline/candidate 0.9224, control 1.0801. Neither completed a group or met
the required sample/control criteria. Remaining panels were not started; no
replacement runs or control normalization were used. All four runtime prototypes
remain private, including the allocation improvement.

## Costs outside the current consumer panel

[`bench/structure-profile.mjs`](../../bench/structure-profile.mjs) compares values
with Cheerio and reports boundary counts at three sizes per shape. Optional
native profiling adds C operation counts. Setup, comparison and disposal are
outside the counted operation. Native and Wasm agree on all 18 cases.

| Shape | Observed work | Focused improvement to investigate when relevant |
|---|---|---|
| First/last child, 256 children | Two traversals return 512 IDs and materialize all child handles | Direct scalar child axes |
| Containment, 256 nested elements | 257 parent traversals | One kernel ancestry check |
| `nextUntil`, 128 sibling roots | 8,128 predicate calls and returned intermediate IDs | Avoid repeated sibling scans while preserving callbacks and stop semantics |
| One 4 KiB attribute value via `attr()` | 4,113 C output chunks | Emit unescaped JSON spans together |
| Enumerating 128 raw attributes | One JSON object plus 256 individual attribute reads | Prefer the existing `attr()` snapshot when a live proxy is unnecessary |
| Overlapping query roots | One visible binding call hides nested root/ancestor checks | Measure root count and depth, not only boundary calls |

Source inspection also identifies repeated ancestor/sibling walks in ordering,
linear attribute-history lookup during cloning, and repeated searches in `has`
and `closest`. These are workload-dependent candidates, not measured MDN gains.
Large input/output buffers grow geometrically and live until document disposal;
retained handles intentionally prevent reclamation of their detached subtrees.
Avoid changing those lifetimes, callback boundaries or snapshot copies merely to
reduce allocations. Existing pool and fragment-reuse findings remain in the
[benchmark guide](../benchmarks.md).

## Compiler analysis

Clang's path-sensitive analyzer completed 12 native and 14 Wasm translation-unit
configurations using existing headers/toolchains, including the Wasm observation
path and diagnostic helpers. Two unique possible-null warnings occurred in both
targets: `has_relative` assumes a nonempty parsed selector list, and XML
serialization assumes reciprocal child/parent links.

The selector parser rejects empty/trailing lists before evaluation; 16 targeted
selector forms in HTML/XML on native/Wasm produced no crash. The XML warning's
path assumes a child whose parent is null while still below the traversal root,
contrary to the tree invariant checked by lifecycle tests and stateful fuzzing.
No reachable defect was reproduced. This is a reviewed invariant dependency,
not a blanket analyzer-clean or memory-safety claim. No dependency patch or
runtime guard was added solely to suppress a warning.

## Regular-expression follow-up

An AST inventory covered 59 regex literals: 22 in shipped ESM and 37 in developer
tooling. No runtime `RegExp` constructor uses input as a pattern. The shipped
patterns have bounded alternatives, anchored runs, delimiter-separated runs or
fixed-width replacements; no individual superlinear matcher was identified.
In particular, JSON-shape detection is anchored with disjoint opening characters,
and positional numeric arguments cannot consume another pseudo's colon.

Two quadratic paths were reproduced and hardened:

- The release pagination pattern `<([^>]+)>; rel="next"` retried overlapping
  suffixes after repeated opening delimiters. Excluding both `<` and `>` from
  the URL removes that ambiguity. Tests mock every request; no live API is used.
- Positional selector matching repeatedly applied a linear regex to shrinking
  prefixes, causing quadratic aggregate work and recursive stack overflow.
  Suffixes are now consumed backwards and applied iteratively in original order.
  At 64/128/256/512 suffixes, total regex input characters fell from
  12,544/49,664/197,632/788,480 to 763/1,531/3,067/6,139. A 10,000-suffix regression
  completes without stack overflow. Counts are not elapsed speedups; applying
  filters still costs work proportional to the selections being filtered.

Both new regression tests fail against the preceding implementation. Native and
pooled-Wasm full suites, seeded fuzzing, portable browser fallback and both
193-case consumer replays pass after hardening. The fixed ordinary-positional
timing screen stopped on host activity after six quiet, retained blocks; its
third group and consumer panel did not complete. The two completed groups had
candidate/control ratios 0.9489/1.0251 and 0.9885/0.9415; both controls miss the
declared tolerance. No general non-regression multiplier is claimed.

This review does not bound every selector or DOM algorithm. The separate
negative-positional compatibility limit is recorded in the
[compatibility guide](../compatibility.md).
