# Engine and MDN replay

The integration experiment uses the installed **website-scrap-engine 0.9.1** package, **Cheerio 1.2.0**, and tracked **mdn-local 0.7.4** source at revision `e7faf4cc7e6f9944139c14b9b1c863b27fae0535`. Both installed dependency versions match the consumer lockfile. The implementation comparison starts from GroveDOM `d29bb5f`.

`scripts/prepare-consumer.mjs` creates an isolated replay snapshot using the consumer's existing TypeScript compiler and dependencies. It transpiles tracked MDN source, copies the installed engine's shipped JavaScript, and redirects their Cheerio imports through the experiment adapter. It rejects modified tracked consumer source and an existing output directory. It does not edit the original repositories, install dependencies or run a crawler. Generated paths, page bodies and reports belong in private scratch storage.

The replay executes the actual engine HTML, inline CSS, meta refresh, SVG and sitemap transforms, along with MDN's HTML pre/post processors and interactive-example transforms. Resource creation, URL replacement, submission and download bodies are deterministic stand-ins. Network, disk persistence, downloader scheduling, URL policy hooks and the full lifecycle are outside this replay. Missing non-BCD download bodies fail explicitly; the missing-BCD case deliberately exercises MDN's fallback renderer.

Eleven authored scenarios exercise nested `srcdoc` through four levels, links/srcset/inline CSS/meta refresh, small and larger XML SVG/sitemaps, playable fragments, missing and successful compatibility tables, generated examples and template-heavy lists. Eight saved MDN pages add real template-bearing inputs: 19 matching cases on native and all Wasm modes. Validation compares serialized resource bodies and ordered discovery/submission events. `loadBuffer` remains deferred; the existing engine decoding helpers supply strings.

## Document ownership

`integration/engine-adapter.mjs` supplies `createEngineAdapter(load)`. Its `run(callback)` owns the complete resource family through transformation **and serialization**. Calls to its `load`, including the returned `$.load`, register documents in that scope. A `finally` releases all documents on success or failure. Nested scopes and simultaneous async resource families remain separate through Node's `AsyncLocalStorage`; this is engine integration code, not an asynchronous DOM kernel or an internal worker pool.

```js
import { load } from 'grovedom';
import { createEngineAdapter } from './integration/engine-adapter.mjs';

const adapter = createEngineAdapter(load);
const output = await adapter.run(async () => {
  const $ = adapter.load(source);
  await transform($);
  return $.html();
});
```

The adapter is an experimental source example, not a new package export or a deployed consumer change. All consumer loads must use the adapter, and the owner must serialize before leaving the scope. Returning live selections or documents across that boundary is invalid. Explicit earlier disposal is permitted. GC cleanup remains a fallback. A scope retains its nested documents until completion; it does not promise a constant memory bound for arbitrarily many generated children.

## Cross-document decision

Cross-document adoption is **deferred**. The audited engine `srcdoc` path loads a child document, transforms it, serializes it and writes the resulting string to an attribute. MDN generated examples create separate resources/documents. Playable examples use a separate fragment load for a string comparison. Insertions, wrapping and replacements use markup or nodes from the same owner; no audited transform transfers a node between owners.

Supporting these lifecycles needs several independent live documents and deterministic disposal, not cross-owner node identity or adoption. Foreign-node insertion continues to fail explicitly. This avoids new copying/lifetime rules and costs in normal mutation paths. This decision is scoped to the audited revisions, not a claim about every engine plugin.

## Reproducing the experiment

Use existing build/runtime dependencies and set `TMPDIR`, caches and build directories to approved disk-backed scratch storage. Supply local paths through environment variables; keep manifests and reports untracked.

```sh
node scripts/prepare-consumer.mjs "$MDN_SOURCE" "$REPLAY_SNAPSHOT"
export GROVEDOM_CONSUMER_SNAPSHOT="$REPLAY_SNAPSHOT"
export GROVEDOM_CORPUS_MANIFEST="$PAGE_MANIFEST"
export GROVEDOM_REPLAY_ENTRY="$CHEERIO_ENTRY"
node scripts/replay-consumer.mjs "$REPORT_DIR/reference.json"
export GROVEDOM_REPLAY_ENTRY="$GROVEDOM_ENTRY"
node scripts/replay-consumer.mjs "$REPORT_DIR/candidate.json" "$REPORT_DIR/reference.json"
```

The optional page manifest is an array of `{ id, path, url? }`. Without it, only the authored scenarios run. `provenance.json` records source/dependency/compiler versions. Kernel/backend selection uses the normal build environment variables.

For release timings, `bench/process.mjs` accepts a manifest with `consumer: true`, the absolute local path to `bench/consumer-replay.mjs` in `workload`, a `corpus`, and two `variants` containing `name`, `entry` and `env`. Each variant runs in a fresh child process. Warmup/startup are excluded; opposite process orders are balanced. Every sample is retained. The optional filtered report rejects complete balanced blocks only when independent CPU probes vary by more than 1.5×, never according to a speedup. Steady host interference can still escape that filter.

For Cheerio/htmlparser2 use `cheerio/slim`, or the root entry with `GROVEDOM_REPLAY_PARSER=htmlparser2`, which applies the supported `xml: { xmlMode: false }` HTML configuration. The private `_useHtmlParser2` flag alone does not survive all of Cheerio's serializer option handling. `normalizeHTML: true` compares reparsed HTML outside the timed children while preserving exact resource-event comparison. This permits harmless serialization differences on equivalent fixtures; it does not make failing fragment/generated-example cases compatible.

`bench/consumer-profile.mjs` records kernel phase counters when available and per-selector binding timings. `GROVEDOM_PROFILE_ALLOCATIONS=1` adds backing-allocation deltas and empty-result counts; `GROVEDOM_PROFILE_ENTRY` selects a paired source snapshot. Use `GROVEDOM_PROFILE_BOUNDARY=0` with a release entry for a less intrusive CPU sampling run. Profiler output is diagnostic; release comparisons establish performance. The replay does not establish the full adoption gate.

## Consumer TypeScript check

The pass after `2c3c16e` checks 87 TypeScript source files with TypeScript 6.0.3, using the frozen MDN revision above and installed engine 0.9.1. Both the Cheerio reference and GroveDOM candidate compile without diagnostics, with `strict` enabled, no emit and library checking enabled. The in-memory migration redirects consumer Cheerio imports and the engine's existing `ReturnType<typeof load>` aliases to the facade. It adds no type assertions or call-site rewrites and does not edit either consumer repository.

```sh
node scripts/check-consumer-types.mjs "$MDN_SOURCE" e7faf4cc7e6f9944139c14b9b1c863b27fae0535
```

The script uses the consumer's existing compiler/dependencies and reads committed MDN source from Git. Omitting the revision checks `HEAD`. It also follows installed engine source imports rather than hiding the migration behind its published Cheerio declarations. This verifies the audited consumer surface; it does not make GroveDOM assignable to unrestricted `CheerioAPI`, validate every plugin, or replace the engine lifecycle/disposal integration still required for deployment.
