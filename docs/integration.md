# Consumer integration

GroveDOM keeps downloader resource policy outside the DOM package. Current
consumer migration and adoption work belongs in `mdn-local`; use the engine's
[current adapter guide](https://github.com/website-local/website-scrap-engine/blob/master/docs/grovedom.md)
and [0.10 migration guide](https://github.com/website-local/website-scrap-engine/blob/master/MIGRATION-0.10.0.md).

## Engine qualification

Published GroveDOM 0.1.2 passed installed-consumer qualification with engine
commit `3a84caa` on Node 22.22.2 and 24.18.0: strict declarations, all 15 runtime
check groups, both downloaders, logging, all 16 ownership/pool cases per runtime,
and module aliases. The engine build and all 1,138 tests passed. Resource
documents are owned explicitly, and cleanup waits for asynchronous status work.

MDN's migration from engine 0.9.1 remains pending. Earlier isolated migration
and 193-case/frozen-page replay results qualify their named snapshots.
The engine's saved MDN patch uses the
removed `withHtmlParser` API and needs adaptation before current adoption.
Fresh replay of the adopted consumer, complete-workload performance and full
archive/browser validation remain open. Cheerio remains the default.

Published 0.1.3 adds [`loadFast()`](compatibility.md#selection-modes).
The existing published-package engine qualification is for 0.1.2 and compatible
`load()`. Qualify 0.1.3 compatible loading on the adopted consumer first.
Evaluating fast mode requires auditing numeric selection access and loader/hook
types, preserving document ownership and nested loads, then checking identical
outputs and complete-workload performance. The current engine already accepts
an application-supplied loader; the library release does not require restoring
engine-owned parser initialization or change its consumer default.

## Historical reference replay

The preserved
[integration adapter](../integration/engine-adapter.mjs) scopes every document
created by a transform family and disposes it in `finally`, including nested
`srcdoc`, generated examples and sitemap loads.

The audited reference is website-scrap-engine 0.9.1 with representative MDN
transforms. The deterministic replay runs nineteen scenarios with fixed resource
responses, bindings, URL/async work and disposal. It excludes real network/disk
and is not a complete crawl or production traffic distribution.

## Corpus

Eight selected saved HTML pages total 511,533 bytes. Portable archive member
names and SHA-256 values are in [bench/mdn-samples.json](../bench/mdn-samples.json).
Four larger pages differ from the former corpus; never combine old and refreshed
corpus timings. Saved output is not a substitute for original unprocessed input.
Private file locations and consumer checkout details do not belong in this repo.

A later local compatibility pass expanded the installed engine 0.9.1 and an
isolated development-engine snapshot to **193 scenarios each**, comparing exact
serialized outputs, download submissions and logged events with Cheerio 1.2.0.
Native and pooled Wasm match all scenarios on both snapshots. The pass includes
88 additional saved files and 15 original MDN HTML responses; 16 direct requests
were attempted, with one recorded 404 and no subresource crawl. Input hashes and
the separate original/saved/generated provenance are retained with the local
replay evidence. Saved documents already contain earlier transformations.

Direct DOM checks cover 174 saved/live markup inputs: full HTML/XML output,
21 selector counts, the first 20 matching name/attribute records per selector,
and sampled foreign text. Both backends match Cheerio. These checks found foreign
attribute/serialization and ancestor-selector defects now covered by small public
regressions. Downloads remain mocked; this is not production-crawl validation or
browser-engine conformance.

`prepare-consumer.mjs` prepares an isolated replay checkout.
`replay-consumer.mjs` checks exact outputs/events against the frozen reference;
`check-consumer-types.mjs` checks the audited TypeScript surface. Recheck source,
installed dependency and lockfile versions before claiming a locked baseline.

## Adoption steps

Use published **grovedom 0.1.3** with the selected current engine revision in an
isolated MDN migration. Update its package runtime requirement and CI to Node
22.13.0 or newer and establish a passing Cheerio baseline before opting into GroveDOM.
Synchronize the manifest, lockfile, installed engine and test/download/release
workflows. Repeat installed-consumer checks for the changed package inputs;
the earlier 0.1.2 qualification does not establish current hook compatibility.
Start with compatible `load()`; evaluate `loadFast()` only after the indexing,
type, callback and lifetime checks above. Keep 0.1.2 as a historical reference.

Use the main pooled-Wasm package. Import and initialize GroveDOM in the
application's options module, then supply its synchronous `load` function as
`loadHtml`. Configure heap and idle-pool settings through GroveDOM's `init()`
before the first load. Each worker imports the options module locally; module
resolution and parser initialization belong to the application. The former
engine `htmlParser` and `grovedom` options are removed. Keep explicit document
disposal and synchronous DOM execution on the caller's thread. The separate
native package has not received this consumer qualification. Unsupported
parser/API behavior must remain explicit.

When hooks call the engine's `loadHtml`, pass document parse options as its
second argument and the application options containing the loader as its fourth.
Omitting the fourth argument selects default Cheerio. Keep resource documents
in `res.meta.doc`. Serialize and dispose generated documents before submitting
child resources; dispose standalone and nested loads in `finally`. Use
`pipeline.logger` and the current submission signatures.
Status observers are read-only; their asynchronous work runs concurrently.
Return that work so cleanup can wait for it. Establish the same engine revision
and options for both parsers, then compare a fixed recording of
original responses for exact outputs, submissions, paths, events and cleanup.

Before production migration, validate representative original inputs and agreed
traffic weights, close any required compatibility gaps and test intended shipping
platforms. Measure the complete DOM workload against current Cheerio and its
fastest compatible configuration using the [adoption criteria](benchmarks.md).
Check full locale archives and offline browsers at the actual adopted revision.
This workspace has not modified or deployed the original consumer runtime.
Local package assembly does not authorize publication or rollout.

[Historical integration audit](history/integration.md) records detailed source
coverage, compatibility checks and prior replay results.
