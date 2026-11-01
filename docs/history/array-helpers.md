# Array allocations and mode specialization

This 0.1.3 investigation follows the [direct-state change](internal-state.md).
It changes compatible JavaScript internals without changing the public API or
Wasm binary. Fast modes remain private feasibility prototypes. Full consumer
performance, browser timing and sustained-memory adoption remain unqualified.

## Compatible runtime changes

Selection copies fill their required output array directly. Membership filters
allocate only their retained ID count; noncallback `is()` avoids a filtered
selection. `index()` searches IDs without materializing wrapper arrays, and
`hasClass()` reads attributes directly. Positional ranges use native slices;
odd/even filters allocate one correctly sized typed array.

Class flattening uses one accumulator and static strings are tokenized once per
operation. Removing/toggling classes compacts tokens without allocating discarded
splice results. Mapping checks node-result types while collecting them. Reverse
insertion reuses helper-owned arrays while preserving caller iterator snapshots.
CSS and form serialization avoid mapped string/entry arrays. Select getters read
IDs directly, and setter conversions preserve sparse slots and coercion order.

CSS profiling identified declaration parsing as the largest JS cost in its
diagnostic. The parser now advances through delimiters without a split-rule array
and reuses one property descriptor per parse. It preserves property order, special
own keys, malformed tails and Cheerio's semicolon behavior. Comparison with the
frozen parser passes 2,059 bounded cases, including long malformed tails.

An attempted Set-based `closest()` deduplication had an unfavorable 1.318 median
elapsed ratio, with a noisy 0.882 identical-code control. It was rejected. The
retained change uses numeric node kind for root checks, removing **512 tag-name
reads** in the 256-element diagnostic. Other measured kernel calls are unchanged
for CSS, class operations and the 120-article replay.

The audit covers all 19 runtime JS files. Remaining `.find()`/`.filter()` calls
are DOM methods; no callback-based Array/TypedArray filtering, mapping, reduction
or iteration helper remains. Native copies/searches and observable key/iterator
snapshots remain where appropriate. Small single-use helpers were inlined, while
shared ownership, parsing and encoding algorithms remain centralized.

All 28 regex literals are at module scope. Static review found no nested
ambiguous quantifiers or other catastrophic-backtracking pattern. Profiles do
not establish regex matching as a bottleneck, so no regex scanner replacement
was added. The CSS delimiter scan addresses a fixed-string split allocation.
No `Math.*` call remains in runtime source. Growth shifts only within its safe
uint32 range; positional counts avoid overflowing `length + 1`. Selector numeric
arguments retain Number range comparisons, including values outside uint32.

Source JS grows from 108,278 to 116,373 bytes; public declarations are unchanged.
The larger explicit loops trade source size for fewer callbacks and temporary
objects. These source sizes are not bundle or download measurements.

## Subclasses and shared JIT feedback

The prior shared-class experiment showed mixed-mode overhead even in cached
loops that create no selections. The constructor mode branch does not execute
inside those timers. A new trace tests one shared class, explicit fast/compatible
subclasses, and separately evaluated full module graphs.

Subclasses have distinct constructors/prototypes but inherit the same `each`
and `attr` function objects. Both shared-class and subclass traces deoptimize
those methods for a wrong receiver map when Proxy receivers first appear.
Separately evaluated graphs have distinct methods and avoid those cross-mode
deopts. First-use Wasm-instance call-target deopts remain. None of the three
traces shows recurring steady-phase or disposal deopts.

These observations establish mixed receiver feedback, not the entire cause of
steady elapsed overhead. Subclasses alone do not isolate method feedback; copying
the same function references onto another prototype would not isolate it either.

Node 24 elapsed ratios below are **candidate / standalone mode**, without control
normalization. Each comparison retains four small documents per entry, uses
separate primary/peer caller modules, eight mirrored groups and ordinary GC. A
peer runs immediately before each timed primary. The split graph also changes
per-kernel instance sharing, so this is not a pure subclass-shape experiment.

| Primary mode | Variant | Cached median | Callback median |
| --- | --- | ---: | ---: |
| Fast | Identical control | 1.013 | 0.961 |
| Fast | Shared class | 1.033 | 1.008 |
| Fast | Explicit subclasses | 0.996 | 0.960 |
| Fast | Split graphs | 1.091 | 0.974 |
| Compatible | Identical control | 1.005 | 0.946 |
| Compatible | Shared class | 1.026 | 1.029 |
| Compatible | Explicit subclasses | 1.026 | 0.998 |
| Compatible | Split graphs | 0.963 | 1.122 |

All 16 comparisons finish. Controls and group ranges are material: split fast
cached ratios are 1.003–1.436, and split compatible callback ratios 0.930–1.184.
Neither subclasses nor split graphs demonstrate universal elapsed parity.

## Compile-time feasibility

A separate generator produces compatible and fast graphs from the same maintained
source. Fast output omits the selection Proxy and numeric Selection declaration,
and adapts array-first merge to read selections with `.get()`. There is no runtime
mode branch. Generic mapped-value collections retain numeric indexing. Interface
declarations remain augmentable; fast merge overloads cover both argument orders.

The proof passes **408 Node contract assertions**, covering both modes, all three
Wasm heap modes, identity, disposal, callbacks, snapshots, mapped values and merge
reentrancy. Another **14 assertions** exercise portable browser entries and their
shared default Wasm URL under Node with mocked fetch. Existing API assertions and
generated declarations pass scoped type checking with `skipLibCheck`.

An additional complete fast source graph costs **114,414 JS bytes** and **10,832
declaration bytes**, before package metadata or compression. Both graphs use one
841,374-byte Wasm artifact. These conservative counts include the copied source
tree; no additional Wasm bytes are required. Algorithm maintenance stays in one
source, but generation anchors, mode contracts and declaration checks still need
maintenance. A future bundler must preserve independent method implementations
instead of merging them back into shared feedback sites.

This proof is distinct from the timed split variants and is not a qualified
public fast-mode release. No foreign-input serialization shim is included.

## Compatible timing and allocation evidence

The first array-helper candidate completes 13 case comparisons and 13 controls.
Narrow repeated copy/index/membership/class-presence/positional medians are
0.158/0.011/0.443/0.452/0.450 of baseline elapsed time. These are operation-specific
results, not complete-workload multipliers. CSS and closest medians are unfavorable
at 1.047 and 1.318; class/form cases have material control drift.

After the CSS parser and closest changes, a declared six-case follow-up completes
all 12 processes. Each uses two independent compatible graphs/callers, twelve
warmups, eight mirrored groups, ordinary GC, fixed deadlines and Cheerio 1.2.0
output checks outside every timed batch. Ratios below are **final / c7fdb8d**.
No group is filtered and controls do not normalize results.

| Case | Final median [group range] | Identical baseline control |
| --- | ---: | ---: |
| CSS | 0.827 [0.488, 1.297] | 0.835 [0.432, 1.093] |
| Closest | 0.852 [0.611, 1.309] | 0.853 [0.637, 1.596] |
| Articles120 | 0.937 [0.690, 1.088] | 0.984 [0.857, 1.138] |
| Articles600 | 0.862 [0.743, 1.367] | 0.952 [0.870, 1.275] |
| Sitemap600 | 0.966 [0.497, 1.603] | 1.144 [0.646, 1.321] |
| SVG300 | 0.961 [0.394, 1.283] | 0.943 [0.444, 1.932] |

The final CSS/closest estimates almost match their controls; these results do
not prove an elapsed gain or full-scope non-regression. Thread CPU readings are
too quantized for reliable short-batch ratios. No panel was extended to seek a
favorable result.

Separate CPU/allocation captures explain removed work. In 32 CSS replays,
sampled allocated bytes fall from about 61.2 MB to 40.5 MB; sampled `entries` and
`split` allocations disappear. Class captures remove sampled discarded-splice
allocations and reduce static-input tokenization. Allocation sampling includes
collected objects; these are estimates of allocated volume, not live memory or
exact allocation counts. Independent profile durations are not paired speedups.

Six relevant upstream modules pass **591 cases with 10 documented skips per
backend**, and **236 focused cases per backend** cover callbacks, options,
selectors, attributes, snapshots and lifecycle behavior on pooled Wasm/native.
Additional initialization and long positional-chain checks pass. Runtime tests
and performance runs retain JIT; only the scoped type compiler uses `jitless`.
No new sanitizer, full-release, real-browser or sustained-memory qualification
is implied. Runs use bounded V8 heaps and a polled RSS stop guard; polling can
overshoot and is not a hard aggregate memory cap.

## Reported 0.1.3 CI receipt

The supplied benchmark compares current 0.1.3, published 0.1.2 and Cheerio 1.2.0
with pooled heaps and the shared browser workload. Run identity, artifact hashes
and raw blocks were not supplied, and this receipt does not confirm other CI jobs
or measure the later changes described above. Here ratios are **reference /
current**, so larger values favor current.

| Case | Reference | Raw | Probe-filtered | Kept/complete |
| --- | --- | ---: | ---: | ---: |
| articles-120 | Released Wasm | 1.121× | 1.121× | 48/48 |
| articles-120 | Cheerio default | 4.363× | 4.363× | 48/48 |
| articles-120 | Cheerio htmlparser2 | 3.101× | 3.101× | 48/48 |
| articles-120 | Identical Wasm | 1.018× | 1.018× | 48/48 |
| articles-600 | Released Wasm | 1.064× | 1.064× | 48/48 |
| articles-600 | Cheerio default | 6.788× | 6.788× | 48/48 |
| articles-600 | Cheerio htmlparser2 | 5.354× | 5.354× | 48/48 |
| articles-600 | Identical Wasm | 1.017× | 1.018× | 47/48 |
| sitemap-600 | Released Wasm | 1.070× | 1.070× | 47/48 |
| sitemap-600 | Cheerio default | 4.528× | 4.528× | 48/48 |
| sitemap-600 | Cheerio htmlparser2 | 4.554× | 4.554× | 48/48 |
| sitemap-600 | Identical Wasm | 1.045× | 1.045× | 48/48 |
| svg-300 | Released Wasm | 1.042× | 1.042× | 48/48 |
| svg-300 | Cheerio default | 3.003× | 2.990× | 47/48 |
| svg-300 | Cheerio htmlparser2 | 3.026× | 3.026× | 47/47 |
| svg-300 | Identical Wasm | 1.035× | 1.035× | 48/48 |

All released/current medians favor current. Controls limit small gain claims;
the SVG/default filtered median remains below 3×. These authored cases do not
establish the complete consumer adoption target.
