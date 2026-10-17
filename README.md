# GroveDOM

**A standalone HTML/XML DOM library with a Cheerio-shaped API.**

GroveDOM parses, queries, modifies and serializes documents using a C/Lexbor
kernel compiled to WebAssembly. Use familiar selectors and chainable operations
from JavaScript, with no runtime dependencies or native installation step.

[Getting started](#getting-started) · [Browser usage](#browser-usage) ·
[Compatibility](docs/compatibility.md) · [Architecture](docs/design.md)

**Experimental:** `0.1.1` is published on npm.
This release is a [compatibility bug-fix patch](CHANGELOG.md), including
documented result and extraction type-inference corrections.
GroveDOM implements a substantial subset of Cheerio, not a complete drop-in
replacement. Check the [compatibility guide](docs/compatibility.md) before migrating.

## Getting started

Requires **Node.js 22 or later**. Node 22 and 24 are tested in CI.
The package provides ES modules; save the example as `example.mjs` and run
`node example.mjs`, or use a project with `"type": "module"`.

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

The API is partial. Unsupported options are rejected; GroveDOM does not
silently fall back to Cheerio. Parser recovery and some selector/DOM edge
cases differ. The [compatibility guide](docs/compatibility.md) describes supported,
best-effort and unsupported behavior; [tests](docs/testing.md) track selected
Cheerio, jQuery and Web Platform Test expectations and known exclusions.

## Configuration

The Node entry initializes its bundled Wasm automatically on the first DOM call.
For custom settings, call `init()` before `load`, `contains` or `merge`:

```js
import { init } from 'grovedom';

init({
  heap: 'pool',
  poolSize: 8,
  poolMaxBytes: 16 * 1024 * 1024,
  // wasm: new URL('./assets/grovedom.wasm', import.meta.url),
});
```

These limits apply to idle instances and their combined linear memory, not
active documents or total process memory. `wasm` can be a local path, file URL,
byte array, ArrayBuffer or compiled `WebAssembly.Module`. A custom binary must
match its JavaScript build. Settings become fixed after successful initialization;
repeated calls throw. Runtime configuration uses this API, with no environment
variables. See [initialization details](docs/prototype.md#runtime-initialization).

## Browser usage

Browsers use the **same Wasm binary** as Node, with asynchronous initialization:

```js
import { init, load } from 'grovedom/browser';

await init({ wasm: '/assets/grovedom.wasm' });
const $ = load('<p>Hello, browser</p>');
try {
  console.log($('p').text());
} finally {
  $.dispose();
}
```

With a bundler, copy `node_modules/grovedom/grovedom.wasm` to a served asset
directory and pass its deployed URL to `init`; adjust the example URL for
deployments under a subpath. For unbundled ESM, serve the package files over HTTP and
import its `src/browser.js`; `await init()` finds the adjacent packaged binary.
Await the first initialization; concurrent or repeated browser calls reject.
DOM calls remain synchronous and occupy the calling thread. GroveDOM parses its own
documents; it does not manipulate the page's live DOM or execute scripts.

Browser support is **best-effort**. Portable module checks pass, and reported
[Firefox 150 and Chromium 140 demo runs](docs/benchmarks.md#011-release-measurements)
exercise the authored workloads. A full browser correctness matrix, including
WebKit, is still pending. No SIMD, shared memory, threads or cross-origin
isolation is required.

The [browser benchmark](docs/prototype.md#browser-and-demo) shares the local and CI
authored workload, using balanced paired blocks against CDN-loaded Cheerio 1.2.0
with default and htmlparser2 parsers and an identical-Wasm control, verifying output
equality on every replay. The [hosted demo](https://website-local.github.io/grovedom/)
serves 0.1.1 through the [GitHub Pages workflow](docs/releasing.md#browser-demo-on-github-pages).

## Packages and platform support

| Package / entry | Status | Scope |
|---|---|---|
| [grovedom](packages/wasm/README.md) | Primary | Node 22/24 on Linux; Node 24 on macOS and Windows |
| `grovedom/browser` | Best-effort | Async ESM entry, same Wasm binary |
| [grovedom-native](packages/native/README.md) | Secondary | Node-API; Linux x64 with glibc 2.35+ |

Install `grovedom-native` separately to use the native backend, then import
`load` from it instead. Both packages have independent state and handle identity.
Neither has runtime or peer dependencies; both include standalone TypeScript
declarations. GroveDOM creates no threads and fetches no document resources.
The native package has no macOS, Windows, ARM64 or musl/Alpine binary and does
not automatically fall back to Wasm. Each linked package README includes its
installation, initialization and lifetime instructions.

## Performance and validation

Scoped Node and browser measurements show gains on selected workloads, including
bindings and disposal. Reported Firefox and Chromium ratios differ substantially.
**Current full-scope non-regression and production adoption remain unverified.**
[Benchmarks, controls and limits](docs/benchmarks.md) preserve the historical
results and unsuccessful comparisons. Measure your complete workload against
the best compatible Cheerio configuration before choosing a backend.

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
