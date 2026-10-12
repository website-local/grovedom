# Readiness and next work

Experimental `0.1.0` is published; `0.1.1` is in development. The main package is
Wasm-first, native is separate, and the browser entry uses the same Wasm binary
with async initialization. [Compatibility](compatibility.md) defines supported,
best-effort and unsupported behavior; [testing](testing.md) tracks coverage.

## Current status

- The architecture refactor and compatibility follow-up passed scoped performance
  screens. Margins are narrow for XML/Node 24 and the selector workload.
- Stateful fuzzing found and fixed insertion-context differences. The quality
  fix's consumer screen passed; its insertion control remains inconclusive.
- Fragment reuse improves an authored bulk-insertion case. Consumer profiling
  points instead to repeated tag checks and attribute access. See
  [evidence and limits](benchmarks.md); none establishes production adoption.
- A [broader corpus](testing.md#broader-corpus-follow-up) adds real response/error
  pages and seeded HTML/XML/SVG inputs. It exposes selector and traversal bugs
  missed by the MDN replays. Two historical optimization trials establish no
  repeatable gain. A fresh reserved-window comparison attempts all twenty
  original panels: seven pass, two fail before/candidate checks, nine have invalid
  controls and two reach their deadlines. The regression goal remains open.
- A later best-effort comparison selects the HTML opening-tag writer for Wasm:
  pooled large-HTML p90/p95 times fall 7.8%/10.6%, with adjusted statistical
  support. Native keeps its previous writer; XML-name and JSON-span trials are
  excluded. The selected runtime passes full correctness and resource checks;
  its completed twenty-panel comparison has six practical median passes, one
  before/current failure and thirteen inconclusive panels. Tail uncertainty
  prevents full-scope performance acceptance. The broader seeded corpus also
  supports the writer's p90 gain; real-page timing remains incomplete.
- A later [isolated validator trial](history/performance-review.md#isolated-attribute-validator-with-shorter-batches)
  completes twenty-four panels with shorter batches and bounded corpus outputs.
  Nineteen pass the practical median screen and five remain inconclusive;
  p90/p95 controls are less consistent. No primary gain meets the declared
  criteria, so the validator stays private and the selected runtime is unchanged.
- A [raw node-kind cache trial](history/performance-review.md#raw-node-kind-cache)
  removes repeated observations on the broader corpora but has no supported
  primary gain. Eighteen median screens pass; six remain inconclusive, including
  a pooled real-page resource stop. The cache stays private, and the original
  regression and tail limitations remain open.
- An [XML span trial](history/performance-review.md#xml-name-and-attribute-spans)
  completes all twenty-four panels without a resource stop: eighteen median
  screens pass and six lack sufficient retained data. No primary p90 gain
  qualifies, so the writer stays private. The separately qualified correction
  for quotes in raw XML attributes is retained; broader performance acceptance
  remains open.
- Hosted build/package checks passed Node 22.0.0 and maintained Node 22/24 on
  Linux, plus pooled Wasm on Node 24 Windows/macOS. Browser engines remain untested.

## Priorities

1. Retain workload-supported optimizations and preserve the unresolved
   regression evidence. Future performance work should isolate concrete
   bottlenecks with fixed comparisons; the [static review](history/performance-review.md)
   separates consumer priorities from wide/deep-tree costs. Preserve callbacks,
   handles and pooled-Wasm speed.
2. Broaden stateful fuzzing and parser/allocation-failure coverage. Current owned
   buffer fault tests do not establish universal upstream OOM recovery.
3. Validate original production inputs and workload weights with the application
   owner; saved-output replays are not a complete crawl distribution.
4. Run compatibility/demo cases in Chromium, Firefox and WebKit before promoting
   browser support from best-effort. Add native platforms when demand justifies
   their build, package and maintenance costs.
5. Configure npm trusted publishing after the token-based bootstrap; follow the
   [manual release workflow](releasing.md) for tested artifacts and provenance.

Avoid broad tuning campaigns, new schedulers/JITs and backend frameworks for noisy
micro-gains. Keep [dependency patches](../native/patches/README.md) minimal, pinned
and regression-tested. [Historical milestones](history/roadmap.md) remain separate
from current readiness.
