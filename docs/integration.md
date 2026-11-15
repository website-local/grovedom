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

Later bounded MDN checks use engine **0.10.0** and published GroveDOM **0.1.3**
with both compatible `load()` and [`loadFast()`](compatibility.md#selection-modes).
They advance beyond the earlier engine 0.9.1 migration experiments, but do not
replace the named 0.1.2 installed-engine qualification above or qualify 0.1.4.
The engine accepts an application-supplied synchronous loader; parser
initialization and the consumer default remain application decisions.

## Bounded MDN 0.1.3 evidence

The retained MDN 0.7.5 runtime uses `SingleThreadDownloader` at concurrency 12
and defaults to Cheerio. Experimental options select either GroveDOM 0.1.3
loader with pooled Wasm. A twelve-root original-response replay matches
**145 responses, 197 exact output files and 2,842 distinct discovery tuples**.
Corrected finite memory checks collect all twelve documents, 3,790 resources
and the downloader. GroveDOM ends near 37.6 MiB of JS heap with 5.0625 MiB of
pooled Wasm retained; these endpoints do not establish sustained memory.

The closed timing schedule has seven valid cells out of nine and only one
complete three-parser block. Available within-block startup-plus-crawl
Cheerio/GroveDOM ratios are 1.752 compatible and 1.765 fast; a later fast pair
is 1.064. These pipeline timings are a different metric from the complete DOM
3× target. Missing cells and uncontrolled load prevent a balanced aggregate.
Separate wrapper-cache experiments retain exact outputs across 73 MDN trees
and support keeping the existing strong cache.

Archive coverage remains bounded: 475 saved files, 46 typed targets and 23
saved search HTML entries, with 22,338 catalogue entries awaiting HTML.
Selected browser/font checks pass within their stated pages and states;
complete locale/search coverage, exhaustive assets and CJK glyphs remain open.
No new downstream product defect was identified in the review of this evidence.
The evidence supports continued experimental evaluation, not removal of the
experimental designation. It contains no 0.1.4 consumer qualification.

## Historical reference replay

<a id="corpus"></a>
The [reference adapter and nineteen-scenario replay](history/integration.md)
and [expanded 193-scenario checks](history/integration.md#expanded-replay-and-corpus)
retain their original engine versions and saved/original/generated input
provenance. They use fixed responses and mocked downloads; neither is a complete
crawl. Recheck source, lockfile and installed dependencies before reuse.

## Adoption steps

Preserve the qualified **0.1.3** replay as a reference. Qualify the final corrected
0.1.4 package against the adopted MDN/engine sources before claiming current
consumer support; the bounded 0.1.3 checks do not transfer automatically.
Keep manifest, lockfile, installed engine and supported Node/CI versions aligned.
Use the same Cheerio baseline and exact original responses for each loader.
Check indexing, types, callbacks, nested loads and lifetime behavior before
opting into `loadFast()`. Keep earlier qualification and timing panels separate.

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
