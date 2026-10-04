# Compatibility status

“Supported” means covered by the implemented API and scoped differential/lifetime
tests. It does not promise every Cheerio edge case or production readiness.
“Best-effort” identifies behavior or environments without that full validation.
Unsupported operations should fail explicitly rather than silently select a
slower parser or omit required work.

| Area | Status | Contract / limits |
|---|---|---|
| Node/Wasm pooled target | Primary, supported | Synchronous DOM calls; Node 22/24 tested; explicit disposal |
| Shared/fresh Wasm heaps | Supported alternatives | Same API; different retention and initialization costs |
| Native Node-API | Secondary | Linux tested; independent package, same facade contract |
| Browser ESM entry | Best-effort | Async init, then synchronous DOM; same Wasm; no Node imports |
| Caller-managed Node workers | Supported | Independent documents per environment; no shared handles |
| HTML documents/fragments | Supported subset | Lexbor parsing with audited Cheerio defaults and context |
| Templates | Supported subset | Content traversal, selectors, mutation and serialization |
| XML/SVG | Supported subset | Case-sensitive XML names, options below; no validating processor |
| Queries/traversal | Supported subset | CSS, audited aliases, relative selectors and collection operations |
| Mutations/callbacks | Supported subset | Attr/text/HTML, insertion/removal, clone/wrap, classes; ordered observations |
| Raw node properties | Supported subset | Stable identity, name/type, attributes, data and relations |
| CSS/data/forms/extract | Supported subset | Covered operations; no browser layout/style computation |
| UTF-8 input | Supported | Strings and byte arrays; no encoding sniffing |
| Malformed-input/error parity | Best-effort | Safety required; exact Cheerio recovery/messages are not a gate |
| General out-of-memory recovery | Best-effort | Owned buffer failures tested; upstream allocator exhaustion not exhaustive |
| Full Cheerio plugin/domhandler compatibility | Unsupported | No unrestricted raw tree splicing or hidden internal API promise |
| Cross-document node adoption | Unsupported | Transfer markup; do not move handles between documents/packages |
| Streams, network loading, loadBuffer sniffing | Unsupported | Decode/fetch outside GroveDOM |
| Browser JavaScript, layout, resource fetching | Unsupported | DOM transformation only |

## Options

`load(content, options?, isDocument?)` supports `scriptingEnabled`, `baseURI`,
`execution: 'buffered' | 'direct'`, `xml` and `xmlMode`. Unknown parser options
are rejected. HTML defaults preserve the audited Cheerio/parse5 contract;
GroveDOM does not implement an htmlparser2 HTML mode.

XML options include `decodeEntities`, `lowerCaseTags`,
`lowerCaseAttributeNames`, `selfClosingTags`, `emptyAttrs`, `encodeEntities`,
`xmlMode`, `recognizeSelfClosing` and `recognizeCDATA`, within the documented
XML mode. XML is non-validating, does not fetch external resources, and does not
expand DTD entities. Per-call serializer options cover the implemented XML
serialization controls. See [the declarations](../src/index.d.ts) for exact
method signatures; they intentionally expose a partial Cheerio surface.

## Lifetime and boundaries

Selections snapshot membership, callbacks observe preceding writes, and detached
observed nodes survive until disposal. `$.dispose()` is idempotent, discards
pending commands, releases document ownership and invalidates handles. Returned
strings/arrays remain valid. Do not transfer handles across workers or packages.
GC cleanup is secondary and has no guaranteed deadline.

Eleven selected upstream cases remain excluded; their reasons are in
[test/upstream/README.md](../test/upstream/README.md). Tests specific to another
backend/heap also skip. The declared Node floor is 22.0.0, but that exact runtime
has not been executed here; maintained Node 22/24 are the tested versions.
Browser graph/portable-path checks run under Node, not Chromium/Firefox/WebKit.
Native Windows/macOS and published-package installation are not validated.

[Integration](integration.md) describes the real consumer replay.
[Historical inventory](history/compatibility.md) preserves the detailed earlier
API audit and exclusions; current support status is the table above.
