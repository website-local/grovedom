# GroveDOM

A Wasm-first, Cheerio-shaped HTML/XML DOM library for synchronous transformations.
It parses, queries, mutates and serializes documents through ordered operations.

**Experimental.** Node.js with pooled Wasm is the primary target. A separate
`grovedom-native` package targets Linux Node-API. The browser entry is best-effort
and uses the **same Wasm binary**, with asynchronous initialization followed by
synchronous DOM calls. No target creates threads or fetches document resources.

Both packages are standalone, including their TypeScript declarations. Cheerio
is a development comparison dependency only; applications do not need it installed.

```js
import { init, load } from 'grovedom';

// Optional on Node: first use otherwise initializes the bundled Wasm.
init({ heap: 'pool', poolSize: 8, poolMaxBytes: 16 * 1024 * 1024 });
const $ = load('<main><a href="/guide">Guide</a></main>');
try {
  $('a').attr('target', '_blank');
  console.log($.html());
} finally {
  $.dispose();
}
```

Use `init({ wasm: pathOrURL })` for a custom Wasm location, or supply bytes or a
compiled `WebAssembly.Module`. Options are fixed after successful initialization;
call `init` before any `load`, `contains` or `merge` call. The runtime does not
read environment variables, package versions or build metadata.

```js
// Browser: await initialization before using the synchronous DOM API.
import { init, load } from 'grovedom/browser';
await init({ wasm: new URL('./grovedom.wasm', import.meta.url) });
```

| Status | Scope |
|---|---|
| Primary, tested | Node 22/24, pooled Wasm, explicit document disposal |
| Tested alternative | Shared/fresh Wasm heaps; independent caller-managed Node workers |
| Secondary, tested on Linux | `grovedom-native`, separate artifact and initialization |
| Best-effort | Browser entry; malformed-input parity; unaudited Cheerio edge cases |
| Not released | Package publication, production deployment and broader platform support |

[Compatibility](docs/compatibility.md) lists supported and unsupported behavior.
[Setup and packaging](docs/prototype.md) explains local builds, target packages
and the browser benchmark demo. [Architecture](docs/design.md),
[performance evidence](docs/benchmarks.md), [memory](docs/memory.md) and
[remaining work](docs/roadmap.md) describe practical limits.

The accepted performance target remains at least 3× current Cheerio for the
complete required DOM workload, including bindings and disposal, plus a win over
the fastest compatible Cheerio configuration. Historical scoped consumer medians
were 4.92× native and 4.62× pooled Wasm; these are not production or browser claims.
No package or repository has been published.

The architectural refactor passes its scoped Node/Wasm regression screen within
the stated 2% tolerance; XML on Node 24 has a narrow margin. See the
[short confirmations and retained controls](docs/benchmarks.md#corrected-affinity-and-final-confirmation).
