# GroveDOM

**A fast, standalone HTML/XML DOM library with a Cheerio-shaped API.**

GroveDOM parses, queries, modifies and serializes documents using a C/Lexbor
kernel compiled to WebAssembly. Use familiar selectors and chainable operations
from JavaScript, with no runtime dependencies or native installation step.

[Getting started](#getting-started) · [Browser usage](#browser-usage) ·
[Compatibility](docs/compatibility.md) · [Architecture](docs/design.md)

**Experimental:** `0.1.0` is published on npm; `0.1.1` is in development.
GroveDOM implements a substantial subset of Cheerio, not a complete drop-in
replacement. Check the [compatibility guide](docs/compatibility.md) before migrating.

## Getting started

Requires **Node.js 22 or later**. Node 22 and 24 are tested in CI.

```sh
npm install grovedom
```

```js
import { load } from 'grovedom';

const $ = load(`
  <main>
    <h1>Hello</h1>
    <a href="/guide">Read the guide</a>
    <p class="advert">Advertisement</p>
  </main>
`);

try {
  $('h1').text('Hello from GroveDOM');
  $('a').attr('target', '_blank').addClass('external');
  $('.advert').remove();

  console.log($('a').attr('href')); // /guide
  console.log($.html());
} finally {
  $.dispose();
}
```

`load()` parses an HTML document by default, adding implied `html`, `head` and
`body` elements. Use `load(markup, {}, false)` for fragments or
`load(xml, { xml: true })` for XML. DOM calls are synchronous.

Always call `$.dispose()` when finished. It releases the document's resources
and invalidates its selections and node handles. Handles belong to their
document; garbage collection is only a cleanup fallback.

## What it supports

- CSS selection, traversal and chainable collections.
- Attribute, text, HTML, class, property and data operations.
- Insertion, removal, cloning, wrapping and callback-based updates.
- HTML templates, XML, form serialization and extraction helpers.
- Independent documents in caller-managed Node worker threads.
- Bundled TypeScript declarations that do not require Cheerio or its types.

The API is partial. Unsupported options and APIs fail explicitly; GroveDOM does
not silently fall back to Cheerio. Parser recovery and some selector/DOM edge
cases differ. The [compatibility guide](docs/compatibility.md) describes supported,
best-effort and unsupported behavior; [tests](docs/testing.md) track selected
Cheerio, jQuery and Web Platform Test expectations and known exclusions.

## Configuration

The Node entry initializes its bundled Wasm automatically on the first DOM call.
For custom settings, call `init()` first:

```js
import { init } from 'grovedom';

init({
  heap: 'pool',
  poolSize: 8,
  poolMaxBytes: 16 * 1024 * 1024,
  // wasm: new URL('./assets/grovedom.wasm', import.meta.url),
});
```

These are the default pool limits. `wasm` can be a local path, file URL, byte
array, ArrayBuffer or compiled `WebAssembly.Module`. Settings become fixed after
successful initialization. Runtime configuration uses this API, with no
environment variables or package-metadata checks. See [initialization details](docs/prototype.md#runtime-initialization).

## Browser usage

Browsers use the **same Wasm binary** as Node, with asynchronous initialization:

```js
import { init, load } from 'grovedom/browser';

await init({ wasm: new URL('./assets/grovedom.wasm', import.meta.url) });
const $ = load('<p>Hello, browser</p>');
try {
  console.log($('p').text());
} finally {
  $.dispose();
}
```

With a bundler, copy `grovedom.wasm` from the installed package to the
URL passed to `init`. For unbundled ESM, serve the package files over HTTP and
import its `src/browser.js`; `await init()` finds the adjacent packaged binary.
DOM calls remain synchronous after initialization. GroveDOM parses its own
documents; it does not manipulate the page's live DOM or execute scripts.

Browser support is **best-effort**. Portable module checks pass, but a tested
Chromium/Firefox/WebKit version matrix is still pending. No SIMD, shared memory,
threads or cross-origin isolation is required.

The [browser benchmark](docs/prototype.md#browser-and-demo) compares three short
rounds against DOMParser and optional CDN-loaded Cheerio 1.2.0, verifying output
equality before timing. The [hosted demo](https://website-local.github.io/grovedom/)
is available after [GitHub Pages deployment](docs/releasing.md#browser-demo-on-github-pages).

## Packages and platform support

| Package / entry | Status | Scope |
|---|---|---|
| `grovedom` | Primary | Node 22/24 on Linux; Node 24 on macOS and Windows |
| `grovedom/browser` | Best-effort | Async ESM entry, same Wasm binary |
| `grovedom-native` | Secondary | Node-API; Linux x64 with glibc 2.35+ |

Install `grovedom-native` separately to use the native backend, then import
`load` from it instead. Both packages have independent state and handle identity.
Neither has runtime or peer dependencies; both include standalone TypeScript
declarations. GroveDOM creates no threads and fetches no document resources.

## Performance and validation

Historical deterministic consumer replays measured median speedups of **4.62×
for pooled Wasm** and **4.92× for native** against Cheerio 1.2.0, including
bindings and disposal. These are scoped Node measurements, not promises for
every input or browser. The architectural refactor passed its scoped regression
screen within a 2% tolerance. [Benchmarks, controls and limits](docs/benchmarks.md)
document the evidence and short-run protocol.

CI covers multiple Node versions and operating systems, selected upstream
correctness cases, worker/document lifetimes, native sanitizers, seeded fuzzing
and isolated package installations. Production adoption and broader browser
validation remain [open work](docs/roadmap.md).

## Development

See [build and package setup](docs/prototype.md) for the pinned Lexbor/WASI inputs
and required Node, Clang/LLVM, CMake and Ninja tools. After configuring those
inputs and output directories:

```sh
npm ci
npm run build:wasm
npm run build:native
npm test
npm run test:types
```

[Architecture](docs/design.md) explains the ESM facade and shared C kernel.
[Testing](docs/testing.md) describes targeted checks, and
[releasing](docs/releasing.md) covers verified tarballs, npm publication and Pages.
Pushes and pull requests run CI; releases require manual dispatch.

## License

[MIT](LICENSE), the same license as Cheerio. Bundled libraries retain their
[third-party licenses and notices](THIRD_PARTY_NOTICES.md).
