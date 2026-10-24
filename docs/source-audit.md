# Source compatibility and safety review

GroveDOM's contract is a tested Cheerio-shaped subset. The review compares
upstream implementation branches with differential reproducers and checks the
native/Wasm ownership boundary. It does not establish complete Cheerio parity or
prove safety for arbitrary inputs. [Current checks](testing.md#current-qualification)
identify the tested runtime and artifact scope.

## Sources examined

The reference is Cheerio 1.2.0 with its locked selector, parser, DOM and serializer
dependencies. Lexbor's revision, patches and resulting fingerprint are pinned in
[native/dependency.json](../native/dependency.json). The
[source inventory](history/source-audit.md#sources-examined) records exact versions,
paths and public references; the [dependency guide](research.md) explains the pin.

## Release invariants

| Boundary | Required behavior | Checks |
|---|---|---|
| Creation and initialization | Reserve initialization before user code; finish load-option reads before owner allocation; permit retry after failure | [Initialization](../test/initialization.test.mjs), [load options](../test/load-options.test.mjs) |
| Ownership | Reject foreign handles before interpreting IDs; workers own independent documents | [Node inputs](../test/node-inputs.test.mjs), [workers](../test/workers.test.mjs) |
| Mutations and callbacks | Apply preceding effects once; preserve callback order, coercion observations and reciprocal links | [Mutation contract](../test/review-contract.mjs), [observations](../test/observation.test.mjs) |
| Selections and raw nodes | Snapshot membership, stable identity and valid detached nodes until disposal | [Read regressions](../test/read-optimization.test.mjs), [lifecycles](../test/expanded-lifecycle.test.mjs) |
| Native/Wasm transport | Validate IDs and command bounds; refresh detached memory views; copy results before returning | [Command bounds](../test/command-boundaries.test.mjs), [Wasm transfers](../test/wasm-transfer.test.mjs) |
| Resource release | Discard pending work on disposal; clear owner/cache references; recover from owned-buffer failures | [Fault injection](../test/faults.c), [memory budgets](../bench/memory-stress.mjs) |
| Parser and selector limits | Bound recursive selector parsing and compatibility matching; preserve template/fragment context | [Selector safety](../test/selector-safety.test.mjs), [template roots](../test/template-query-roots.test.mjs) |

Kernel calls do not invoke user JavaScript. Shared transfer scratch is borrowed
only during synchronous calls; pending queues and results remain document-owned.
Native allocator ownership and counters are thread-local. See
[architecture](design.md#invariants) and [memory](memory.md) for these rules and
intentional retention, including observed detached nodes and prior rename interfaces.

The earlier Clang analysis emitted warnings at two locations: XML CDATA traversal
assumed a child without its reciprocal parent, and selector inspection assumed
an empty non-null parser group. Insertion helpers and the pinned parser exclude
those paths. This is an invariant-based disposition, not a warning-free analysis;
tree/recovery tests and sanitizer checks complement it.

## Corrected behavior

The historical audit preserves each before/after table and reproducer. These
links retain the earlier section anchors without repeating the checkpoint narrative.

- <a id="fixed-behavior"></a>[Initial API/source corrections](history/source-audit.md#fixed-behavior): attributes, data, classes, forms, traversal, insertion and XML references.
- <a id="follow-up-gap-fixes"></a>[Follow-up gaps](history/source-audit.md#follow-up-gap-fixes): exact attribute names, callbacks, Unicode selectors, cloning and select parsing.
- <a id="comparison-with-published-010"></a>[Published 0.1.0 comparison](history/source-audit.md#comparison-with-published-010): properties, extraction, replacement and positional suffixes.
- <a id="edge-case-coverage"></a>[Callback and template edges](history/source-audit.md#edge-case-coverage): duplicate occurrences, descriptor getters, XML forms and overlapping roots.
- <a id="selector-and-attribute-hardening"></a>[Selector and resource hardening](history/source-audit.md#selector-and-attribute-hardening): nesting bounds, exact-key replacement and relative lists.
- <a id="insertion-ownership-and-traversal-follow-up"></a>[Insertion and ownership](history/source-audit.md#insertion-ownership-and-traversal-follow-up): repeated nodes, foreign queries, traversal duplicates and null form values.

## Remaining differences

Use the [compatibility guide](compatibility.md) for public API choices. Confirmed
limits include:

- Unicode comparisons use baked Unicode 17.0 data; host-engine versions can differ.
- Clones and repeated insertion keep reciprocal links and one physical node.
  Cheerio can expose different clone-root or duplicate-child behavior.
- Raw attribute snapshots use ordinary objects; replacement copies values into
  document storage instead of sharing the caller's object.
- Some context-returning `:scope` and mixed sibling/absolute lists remain best-effort.
- HTML/val callbacks, whole-class toggling, derived setters and raw properties on
  non-elements include GroveDOM conveniences rather than exact Cheerio parity.
- Parentless `before`/`after` callbacks can run where Cheerio skips them. Parser
  recovery beyond the tested cases and unsupported APIs remain explicit limits.

The [detailed differences](history/source-audit.md#remaining-differences) retain
the reference behavior and exceptions. Repeated Cartesian comparisons are not
independent defect counts. Timing claims belong in [benchmarks](benchmarks.md).
