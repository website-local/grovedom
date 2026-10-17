# grovedom

Parse, query, edit and serialize HTML and XML with a Cheerio-shaped JavaScript
API. GroveDOM uses a bundled C/Lexbor WebAssembly kernel, with no runtime or peer
dependencies and no compiler needed at installation.

**Experimental.** GroveDOM implements a subset of Cheerio. Review the
[compatibility guide](https://github.com/website-local/grovedom/blob/main/docs/compatibility.md)
and [changelog](https://github.com/website-local/grovedom/blob/main/CHANGELOG.md)
before migrating or upgrading.

## Install and run

Requires **Node.js 22 or later**. The package provides ES modules and bundled
TypeScript declarations; Cheerio and its types are not required.

```sh
npm install grovedom
```

Save this as `example.mjs` and run `node example.mjs`, or use a project with
`"type": "module"`:

```js
import { load } from 'grovedom';

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

`load()` parses a full HTML document by default, adding implied `html`, `head`
and `body` elements. Input can be a string or a UTF-8 `Uint8Array` (including a
Node `Buffer`). Decode other encodings before calling it.

## Fragments and XML

Pass `false` as the third argument to parse an HTML fragment. Enable XML
explicitly to retain case-sensitive XML names:

```js
import { load } from 'grovedom';

const fragment = load('<p>One</p><p>Two</p>', {}, false);
try {
  console.log(fragment.html()); // <p>One</p><p>Two</p>
} finally {
  fragment.dispose();
}

const xml = load('<feed><Title>News</Title></feed>', { xml: true });
try {
  console.log(xml('Title').text()); // News
  console.log(xml.xml()); // <feed><Title>News</Title></feed>
} finally {
  xml.dispose();
}
```

HTML-mode SVG follows the documented Cheerio default behavior; use XML mode
when you need XML case and qualified-name handling. XML parsing is non-validating
and does not expand DTD entities or fetch external resources.

## Document lifetime

Always dispose each document in `finally`. `$.dispose()` is idempotent and
invalidates that document's selections and node handles. Serialize or extract
the values you need before disposal; garbage collection is only a cleanup fallback.

Selections snapshot their membership. Nodes belong to the document and package
entry that created them. Transfer markup or extracted values between documents
and workers; cross-document node adoption and shared handles are unsupported.

DOM calls are synchronous and occupy the calling thread. Caller-managed Node
workers may own independent documents; GroveDOM creates no threads itself.

## Initialization and memory

In Node, the first DOM call loads the bundled Wasm automatically. To configure
it, call `init()` once before `load`, `contains` or `merge`:

```js
import { init } from 'grovedom';

init({
  heap: 'pool',
  poolSize: 8,
  poolMaxBytes: 16 * 1024 * 1024,
});
```

These are the defaults. `poolSize` and `poolMaxBytes` limit **idle instances**
and their combined linear memory, not active documents or total process memory.
Setting either limit to zero disables idle retention.

| Heap | Behavior |
|---|---|
| `pool` | Each live document has an instance; eligible disposed instances are reused within the idle limits. |
| `document` | Each document gets a fresh instance, released from GroveDOM's ownership on disposal. |
| `global` | Documents in the same entry share one instance; its linear memory retains its grown capacity. |

The optional `wasm` setting accepts a local path, file URL, `Uint8Array`,
`ArrayBuffer` or compiled `WebAssembly.Module` in Node. A custom binary must
match the JavaScript files from the same build. Configuration is fixed after
successful initialization; repeated initialization throws. A failed attempt
can be retried. Runtime settings use this API, not environment variables.

## Browser usage

The browser entry needs explicit asynchronous initialization. With a bundler,
copy `node_modules/grovedom/grovedom.wasm` to your served assets directory and
set `wasm` to its deployed URL. For an asset served at `/assets/grovedom.wasm`:

```js
import { init, load } from 'grovedom/browser';

await init({ wasm: '/assets/grovedom.wasm' });
const $ = load('<p>Hello, browser</p>');
try {
  console.log($('p').text()); // Hello, browser
} finally {
  $.dispose();
}
```

Adjust that URL for deployments under a subpath. Without a bundler, serve the
whole package over HTTP and import its browser module directly. For example,
with the package served under `/vendor/grovedom/`:

```js
import { init, load } from '/vendor/grovedom/src/browser.js';

await init(); // Loads /vendor/grovedom/grovedom.wasm.
const $ = load('<p>Hello</p>');
try {
  console.log($('p').text()); // Hello
} finally {
  $.dispose();
}
```

Use these examples in a module script. The default `grovedom` export also
selects the browser entry when a bundler enables its `browser` condition.
Await the first `init()` before any DOM calls; concurrent or repeated calls
reject. URL loading follows browser CORS and CSP rules. DOM calls are
synchronous afterward and operate on GroveDOM's own documents, without
executing scripts or changing the page's live DOM.

The browser uses the same Wasm binary as Node. It requires no SIMD, shared
memory or cross-origin isolation. Support is **best-effort**: reported Firefox 150
and Chromium 140 [correctness-page runs](https://github.com/website-local/grovedom/blob/main/docs/testing.md#reported-browser-runs)
each pass 810 cases with 35 documented skips and no failures. WebKit and broader
browser API coverage remain unqualified; portable fallback checks run under Node.

## Compatibility and performance

The supported subset includes CSS queries, traversal, attributes, text/HTML,
classes, data, insertion/removal, cloning/wrapping, templates, forms and
extraction. Parser recovery, some selector lists, raw domhandler behavior and
detached-node insertion callbacks differ from Cheerio. Unsupported options are
rejected; there is no automatic Cheerio fallback. Streams, network loading,
encoding sniffing, script execution and browser layout are outside this API.

CI covers Node 22/24 on Linux and Node 24 on macOS and Windows. The separate
[grovedom-native package](https://www.npmjs.com/package/grovedom-native) provides
a Linux x64/glibc Node-API backend. Packages have independent initialization and
node identities; switching packages does not transfer existing documents.

Measure your own complete workload, including loading, callbacks, serialization
and disposal, against your best compatible Cheerio configuration. Historical
Node speedups are workload-specific; current full-scope non-regression and
production adoption remain unverified. See the
[benchmark evidence](https://github.com/website-local/grovedom/blob/main/docs/benchmarks.md)
and [validation scope](https://github.com/website-local/grovedom/blob/main/docs/testing.md).

## License

[MIT](https://github.com/website-local/grovedom/blob/main/LICENSE).
The package includes `LICENSE`, `THIRD_PARTY_NOTICES.md` and `licenses/` for
GroveDOM and its bundled libraries.
