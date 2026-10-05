# Developer diagnostics

These ESM modules are excluded from published packages. Import `index.js` for a
diagnostic facade and `kernel.js` for its counters. Developer environment settings
select artifacts; application configuration still uses public `init()`.

## Allocation and Wasm lifecycle

Build native with `GROVEDOM_PROFILE=1` to enable `kernel.profileReset()` and
`kernel.profile()`. Rows contain calls, inclusive nanoseconds, exclusive
nanoseconds, reference-clock ticks and units. Sum the **exclusive** malloc,
calloc, realloc and free rows: calloc includes a nested malloc. Scopes include
bookkeeping and zeroing, and count arena backing requests rather than node slots.
They exclude document control-block and Node/V8 allocations. Release builds omit
these scopes. Reference ticks are not CPU instruction counts.

Selector rows count case-insensitive comparisons by operator, Unicode fallbacks,
and ASCII-probe calls, bytes and logical scalar loads. Byte counts include
overlapping tail reads; load counts describe the C algorithm, not retired CPU
instructions. These counters also compile out of release builds.

Fragment diagnostics report HTML fragment-parser calls/time, input bytes, lazy
insertion-context requests/creation attempts, and subtree-clone calls/time.
They distinguish repeated parsing from allocation of the reusable template
context; XML fragments use the existing XML phases. Run
`GROVEDOM_BACKEND=napi node bench/fragment-profile.mjs` against a native build
made with `GROVEDOM_PROFILE=1` for a fixed, Cheerio-checked comparison of string
insertion and explicit fragment cloning. It reports ten measured replays per
strategy after twenty warmups. Its independent instrumented times are diagnostic,
not a release-speed comparison.

For Wasm, build with `GROVEDOM_WASM_PROFILE_GROWTH=1`, then use that setting with
`GROVEDOM_WASM_BUILD_DIR` when loading the diagnostic entry. `growthStats()` reports
cumulative positive linear-memory growth calls, pages and milliseconds. Subtract
snapshots around a replay; do not infer growth cost from the final heap capacity.

`GROVEDOM_PROFILE_LIFECYCLE=1` enables creation/reuse/retirement observations with
either a release or growth-instrumented Wasm binary. `lifecycleStats()` includes
count-limit and byte-limit retirements, active owners, idle capacity and a bounded
event list. `lifecycleLabel(value)` labels events; `lifecycleReset()` resets
counters without draining the pool or forgetting active owners. Explicit trim and
unpooled retirement are separate categories. Finalization remains nondeterministic.

`instancePrefixMilliseconds` starts at `kernel.create` entry and ends immediately
after VM instantiation, before kernel initialization/parsing. It includes the
small create prefix and is not an isolated constructor timer. A shared instance
created during kernel setup is counted but has no timed create prefix.

For a controlled diagnostic override, use `GROVEDOM_WASM_POOL_SIZE` and
`GROVEDOM_WASM_POOL_MAX_BYTES`. Fix inputs, order and pass count before capturing.
Keep cold and repeated passes separate and verify outputs outside timing.

## Synchronous operation attribution

`operation-timing.js` exports `operationTiming()`, `timeFunctions(object, timer,
domain)` and `timeFacade(load, timer)`. Use a dedicated `createFacade` instance:
`timeFacade` instruments its collection prototype. `timeFunctions` replaces own
function properties on a mutable object; copy non-writable native exports first,
including their non-enumerable properties.

Nested calls in the same domain count once. Facade wrappers suspend DOM timing
for explicit collection callbacks; reentrant DOM calls resume it. `reset()` and
`snapshot()` must run outside measured calls. Exceptions restore the caller's
domain. These are synchronous timers, not async-span tracking. Exotic coercion,
plugin callbacks and asynchronous callback continuations are not fully attributed.

For consumer studies, wrap URI methods in a separate domain and wrap the kernel
used by the dedicated facade to cover calls from raw node access. URI method
wrapping does not cover a constructor's direct body. Unwrapped JS remains
unattributed; do not label all non-DOM time as URI time. Check equality against an
uninstrumented replay. These timers perturb execution and cannot establish release
speedups; see [measurement scope and results](../docs/benchmarks.md).
