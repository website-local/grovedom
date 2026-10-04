# Consumer integration

GroveDOM keeps downloader resource policy outside the DOM package. The
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

`prepare-consumer.mjs` prepares an isolated replay checkout.
`replay-consumer.mjs` checks exact outputs/events against the frozen reference;
`check-consumer-types.mjs` checks the audited TypeScript surface. Recheck source,
installed dependency and lockfile versions before claiming a locked baseline.

## Adoption steps

Use the main Wasm package with `init` before the first transform. Keep explicit
adapter-owned disposal and synchronous DOM execution on the caller's thread.
The separate native package is an alternative, not an automatic fallback.
Unsupported parser/API behavior must remain explicit.

Before production migration, validate representative original inputs and agreed
traffic weights, close any required compatibility gaps and test intended shipping
platforms. This workspace has not modified or deployed the original consumer.
Local package assembly does not authorize publication or rollout.

[Historical integration audit](history/integration.md) records detailed source
coverage, compatibility checks and prior replay results.
