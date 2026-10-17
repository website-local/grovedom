# grovedom-native

The native Node-API backend for GroveDOM: parse, query, edit and serialize HTML
and XML with a Cheerio-shaped JavaScript API and a bundled C/Lexbor kernel.

**Experimental.** This is a separate, secondary package. The primary
[grovedom package](https://www.npmjs.com/package/grovedom) uses WebAssembly and
also provides a browser entry. Both implement a subset of Cheerio; read the
[compatibility guide](https://github.com/website-local/grovedom/blob/main/docs/compatibility.md)
and [changelog](https://github.com/website-local/grovedom/blob/main/CHANGELOG.md)
before migrating or upgrading.

## Requirements and installation

Requires **Node.js 22 or later on Linux x64 with glibc 2.35 or later**.
The package contains a prebuilt addon, has no runtime or peer dependencies and
does not compile code during installation. It provides ES modules and bundled
TypeScript declarations; Cheerio and its types are not required.

This package does not provide macOS, Windows, ARM64, musl/Alpine or browser
binaries. Use `grovedom` for the Wasm backend; there is no automatic fallback
when the native addon cannot load.

```sh
npm install grovedom-native
```

Save this as `example.mjs` and run `node example.mjs`, or use a project with
`"type": "module"`:

```js
import { load } from 'grovedom-native';

const $ = load('<main><h1>Hello</h1><a href="/guide">Guide</a><p class="ad">Ad</p></main>');
try {
  $('h1').text('Hello from GroveDOM');
  $('a').attr('target', '_blank').addClass('external');
  $('.ad').remove();

  console.log($('h1').text()); // Hello from GroveDOM
  console.log($('main').html());
} finally {
  $.dispose();
}
```

## HTML, fragments and XML

`load()` parses a full HTML document by default, adding implied `html`, `head`
and `body` elements. Input can be a string or a UTF-8 `Uint8Array` (including a
Node `Buffer`). Decode other encodings before calling it.

Use `load(markup, {}, false)` for HTML fragments and `load(markup, { xml: true })`
for XML. XML names are case-sensitive; HTML-mode SVG follows the documented
Cheerio default behavior. XML parsing is non-validating and does not expand DTD
entities or fetch external resources.

```js
import { load } from 'grovedom-native';

const $ = load('<feed><Title>News</Title></feed>', { xml: true });
try {
  $('Title').text('Updated');
  console.log($.xml()); // <feed><Title>Updated</Title></feed>
} finally {
  $.dispose();
}
```

## Document lifetime and workers

Always dispose each document in `finally`. `$.dispose()` is idempotent and
invalidates that document's selections and node handles. Serialize or extract
the values you need before disposal; garbage collection is only a cleanup fallback.

Selections snapshot their membership. Nodes belong to the document and package
entry that created them. Transfer markup or extracted values between documents
and workers; cross-document node adoption and shared handles are unsupported.
Native and Wasm entries have independent initialization and node identities.

DOM calls are synchronous and occupy the calling thread. Caller-managed Node
workers may own independent documents; GroveDOM creates no threads itself.

## Initialization

The first DOM call loads the bundled addon automatically. To use a custom
location, call `init()` once before `load`, `contains` or `merge`:

```js
import { init } from 'grovedom-native';

init({ addon: new URL('./assets/grovedom.node', import.meta.url) });
```

This example requires the matching `grovedom.node` from the installed package
at `./assets/grovedom.node` beside your module. The `addon` option accepts a
local path or file URL. Keep the addon and JavaScript files from the same build;
an arbitrary Lexbor library is not a GroveDOM addon.

Configuration is fixed after successful initialization; repeated calls throw.
A failed attempt can be retried. Runtime settings use this API, not environment
variables. Wasm settings such as `heap`, `poolSize` and `poolMaxBytes` do not
apply to this package.

## Compatibility and performance

The supported subset includes CSS queries, traversal, attributes, text/HTML,
classes, data, insertion/removal, cloning/wrapping, templates, forms and
extraction. Parser recovery, some selector lists, raw domhandler behavior and
detached-node insertion callbacks differ from Cheerio. Unsupported options are
rejected; there is no automatic Cheerio fallback. Streams, network loading,
encoding sniffing, script execution and browser layout are outside this API.

Native Node 22/24 checks cover the documented Linux platform, caller-managed
workers, disposal and sanitizer runs. See the
[validation scope](https://github.com/website-local/grovedom/blob/main/docs/testing.md)
for selected upstream cases and exclusions.

Choose a backend by measuring your complete workload, including loading,
callbacks, serialization and disposal, against your best compatible Cheerio
configuration. Native is not guaranteed to outperform Wasm. Historical Node
speedups are workload-specific; current full-scope non-regression and
production adoption remain unverified. The
[benchmark evidence](https://github.com/website-local/grovedom/blob/main/docs/benchmarks.md)
records the controls and limitations.

## License

[MIT](https://github.com/website-local/grovedom/blob/main/LICENSE).
The package includes `LICENSE`, `THIRD_PARTY_NOTICES.md` and `licenses/` for
GroveDOM and its bundled libraries.
