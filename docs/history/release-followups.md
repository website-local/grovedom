# Release optimization follow-ups

These are scoped checkpoints through experimental 0.1.1. They preserve operation
counts, retained capacity, timing controls and inconclusive results; they do not
establish current production performance. See [current evidence](../benchmarks.md)
for release/browser measurements and the comparison protocol.

## Compatibility review follow-up

The subsequent six-fix review has no conclusive elapsed-time result. Six fixed
native/pooled-Wasm panels attempted the authored HTML/XML/SVG workloads on Node
22/24 and a successful API workload on Node 22, with forty warmups, three groups
of four blocks, two batches of four replays, independent module graphs and two
identical-code controls. Every panel stopped at its declared host-activity limit.
Only thirteen of seventy-two planned blocks completed; eleven passed the
independent probe filter. Partial raw ratios ranged from 0.876 to 1.098, with
material control drift. These incomplete draft results do not pass a regression
screen and were not extended.

The final change then removed a draft parent lookup from every sibling insertion
callback, leaving detached-callback parity explicitly best-effort. In the
120-element API diagnostic, boundary calls were 1,940 before, 2,181 in that draft
and 1,941 after removing the lookup. The remaining extra call checks node kind
when assigning raw character data. The authored HTML120 replay stays at 255 calls.
These are operation counts, not elapsed speedups; the final adjustment was
correctness-tested without another timing campaign. Attribute creation preserves
exact interned names without changing ordinary reads or serialization.

## Relative-list resource correction

A later readiness review found that ordering a relative selector list queried
every descendant before filtering the matches in JavaScript. This registered
unrelated nodes and prevented their removed subtrees from being reclaimed until
document disposal. Ordering now uses only existing matched IDs: small unions
compare ancestry, while larger unions walk the tree without exposing more nodes.

With two matches and 20,000 unrelated nested element pairs, total returned IDs
fall from **40,013 to 12**, with eleven kernel calls in both versions. Eight
query/empty/refill cycles with 2,000 pairs produce these tracked capacities:

| Backend | Pre-fix candidate | Fixed candidate |
|---|---:|---:|
| Native | 10,977,504 bytes | 2,736,592 bytes |
| Pooled Wasm | 6,010,900 bytes | 1,566,468 bytes |

The fixed runs plateau; outputs match and both versions reach zero tracked live
bytes after disposal. These are backing-allocation capacities, not RSS or a
post-disposal leak. Each comparison uses matching JavaScript and C artifacts.

For 120 writes to one raw text handle, caching its immutable kind reduces kernel
calls from **240 to 121**. Each distinct written handle still needs its first kind
read: one write to each of 120 handles remains 240 calls. Cache hits flush pending
writes before coercion. These operation/resource probes make no elapsed-time,
universal non-regression or adoption claim.

## Consumer bottlenecks and bulk insertion

Three measured passes after two warmups through the five-case offline consumer
panel produce 45 loads/disposals, 219 fragment parses, 16,386 repeated tag
predicates and 19,905 attribute observations. Native exclusive query/binding
shares are 37.7%/19.1%, compared with 0.33% fragment parsing. These instrumented
shares are not whole-pipeline or Wasm percentages; consumer URL processing is
also substantial. Predicate/input-transfer prototypes reduce calls but lack
full-scope timing acceptance. No allocator rewrite is justified by these results.

For authored bulk insertion, explicitly parsing once and cloning through the
existing API reduces fragment parses from 320 to four, adds 316 clones and keeps
163 arena backing requests. The fixed nine-block pooled screen gives
baseline/clone **1.4606**, control **0.9913**, all blocks quiet/retained.
This is an authored opportunity, not a consumer speedup or permission to cache
arbitrary mutation results. Use [fragment profiling](../../bench/fragment-profile.mjs)
and [structural profiling](../../bench/structure-profile.mjs) for attribution.

## Historical checkpoints

The architecture refactor passed its scoped 2% screen, with narrow XML/Node 24
headroom (0.9844, control 1.0059 in a separate eight-replay confirmation).
Earlier inconclusive affinity/control panels remain separate. The insertion
quality follow-up passed its saved-consumer screen (1.0034/control 0.9817) but
left ordinary insertion inconclusive (1.0132/control 0.9574).

### Scalar ASCII-scan confirmation

The compatibility follow-up against `e530f92` passed its scoped pooled-Wasm
screen: selector ratio/control **0.9802/0.9861**, consumer **0.9913/0.9841**.
All 18 blocks were retained and quiet; 100 warmups, three groups × three blocks,
two batches of eight selector or one consumer replay. Median/max batches were
5.2/8.3 and 26.7/51.0 ms. Raw/filtered aggregates agree; selector headroom over
0.98 is only 0.0002. Group candidate/control ranges were 0.955–1.120/0.925–0.996
and 0.988–0.994/0.979–1.031. This does not establish a universal speedup.

Bounded scalar reads reduced logical ASCII loads from 8,670 to 2,910 in the
selector diagnostic and 62,742 to 17,490 in the consumer diagnostic; neither used
Unicode fallback. The first prototype failed (0.9476, control 1.0041). Earlier
normalization/token experiments and their failed/inconclusive controls remain in
[experiment history](selector-experiments.md). Normalization stays in JS.

### Historical adoption evidence

Pre-refactor `b27dbe2` median ratios against Cheerio 1.2.0:

| Panel | Native | Pooled Wasm |
|---|---:|---:|
| Mixed HTML/XML | 5.804× | 5.400× |
| Nineteen-scenario consumer | 4.920× | 4.621× |
| Eight saved MDN pages, raw | 5.480× | 5.102× |

These passed scoped aggregate and faster-compatible-baseline checks; individual
SVG/XML margins were narrow. [Historical controls](benchmarks.md#wasm-first-investigation-after-2eef7b6)
do not establish current production weights, browser speed or whole-downloader gains.
