# GitHub CI and releases

Experimental **0.1.2 is published** from `25faa49`; source manifests, lockfile,
changelog and the Release workflow default target **0.1.3 (unreleased)**.
The hosted demo and Browser demo workflow default use **v0.1.2**.
Pushes and pull requests verify code. Publication requires manual **Release**
dispatch; a version bump alone publishes nothing.

## Verification

CI and releases share `verify.yml`. Its eleven jobs cover two builds, sanitizers,
package assembly, five OS/Node groups, a diagnostic benchmark and the final gate:

- Fingerprint-verified Lexbor and SHA-256-verified WASI SDK 25 libraries. Hosted
  Wasm uses Ubuntu 24.04/Clang 19; native uses Ubuntu 22.04/Clang 15. Local scripts
  use existing tools and install no compilers.
- Full Linux tests on Node 22.0.0 and maintained Node 22/24, all Wasm heaps,
  plus pooled Wasm on Windows/macOS with Node 24. Each runtime gets a fresh process.
- Native ASan/UBSan, leaks, owned-buffer failures, 200 seeded cases per backend,
  64 sanitized cases, standalone declarations and portable browser graph checks.
- Packages packed once and installed offline into empty consumers. Installed
  contracts cover XML, callbacks, handles, disposal and caller-managed workers.

All checks in a group are attempted; a failure fails the job. Runtime checks can
run after packaging failure, and failed runtime checks do not skip available
package checks. Binaries rebuild each run; npm caches only downloaded dependencies
by lockfile. The Node 22 declaration check runs once. Actions use pinned commits;
Dependabot groups monthly updates. Node types stay on major 22 and TypeScript on
major 6 until the checker supports a changed compiler entry point.

Default token permissions are read-only, and pull requests receive no release
credentials. CI timing has no speed threshold; output mismatches, setup failures
or insufficient samples fail verification. The
[reported 0.1.2 CI status](testing.md#reported-012-ci-passes), local qualification and
[actual-browser results](testing.md#reported-browser-runs) have separate scopes.

For local verification, configure builds and disk-backed temporary/cache/fuzz
outputs as in [setup](prototype.md), then choose a new output directory:

```sh
npm run ci:pack -- ./build/release
npm run ci:test -- all-heaps both ./build/release/tarballs
```

`all-heaps` needs Linux native artifacts; `portable wasm` checks pooled Wasm only.
This runs the current Node version, not the entire hosted matrix.

## Packages and platform scope

The source workspace remains `private: true`. `ci:pack` explicitly assembles
publishable copies, checks binaries and standalone types, then packs:

| Package | Artifact and scope |
|---|---|
| `grovedom` | Wasm-first Node package and best-effort async browser entry; the same binary for both |
| `grovedom-native` | Optional Linux x64/glibc binary, built on Ubuntu 22.04; glibc 2.35 or later |

The native manifest restricts OS, CPU and libc; no ARM64, musl, Windows or macOS
addon is shipped. A local build on a newer system does not establish the hosted
native compatibility floor. Both packages have no runtime or peer dependencies.
The [package READMEs](../packages/wasm/README.md) and [native guide](../packages/native/README.md)
are copied into their tarballs.

Published versions through 0.1.2 are immutable. Update both manifests, lockfile,
changelog and Release default together for a new development version. Preflight requires a
unique, nonempty changelog entry matching the committed version. Deliberate
incompatible API changes during 0.1 development require 0.2.0; compatibility fixes
can still correct observable results and types, as documented for [0.1.1](../CHANGELOG.md#011).
Never run `npm publish` from the source checkout.

## Release a reviewed commit

1. Push the reviewed commit to `main` and verify CI. Configure GitHub `npm` and
   `release` environments for `main`; required reviewers are recommended. Branch
   protection should require the reusable workflow's `gate` status.
2. Dispatch **Actions → Release** on `main` with the committed version,
   `npm_packages: none|wasm|both`, `npm_tag: latest|next`, and `npm_auth: oidc|token`.
   Prerelease versions require `next`. The default `none` creates a GitHub release
   with artifacts but makes no npm publication.
3. Approve configured environment deployments. The workflow rebuilds and verifies
   the selected commit before consuming its tested tarballs for publication.

A dispatch authorizes its selected actions. It does not change versions, reserve
package names, create accounts or configure external settings.

## Trusted publishing after bootstrap

Configure each npm package under **Settings → Trusted publishing**:

| Field | Value |
|---|---|
| Organization or user | `website-local` |
| Repository | `grovedom` |
| Workflow filename | `release.yml` |
| Environment | `npm` |

Use `release.yml`, not `verify.yml`. With `npm_auth: oidc`, only the npm job gets
`id-token: write`; the pinned npm CLI requests provenance and sets the selected
dist-tag without a token. See [npm's documentation](https://docs.npmjs.com/trusted-publishers/).

## First npm publish

Both GroveDOM names already exist. For a new package, the first successful publish
creates the name; GitHub ownership does not reserve it. Verify the npm account's
email, 2FA and name permissions. A granular bootstrap token must permit package
creation, read/write access and automated bypass-2FA; a token restricted to existing
packages cannot create a new name. Store a short-lived token as **NPM_TOKEN** in
the GitHub **npm environment**, select `npm_auth: token`, then revoke it after
trusted publishing works. No token belongs in the repository.

## Artifacts and retries

`npm-tarballs` contains both `.tgz` files, `SHA256SUMS` and `release.json` with the
source commit and npm integrity values. Offline installs verify these before npm.
Publishing uses the same bytes without rebuilding or running lifecycle scripts.
GitHub publication requires successful validation, requested npm publication and
an uncancelled workflow; skipped npm qualifies only for `npm_packages: none`.

Two-package publication is not atomic. Rerun failed jobs with the same artifacts.
An existing npm version must have identical integrity; mismatching bytes fail.
An already-correct dist-tag needs no write. With npm 11.6.2, changing an existing
version's tag requires `npm_auth: token`; OIDC preflight detects that before
publishing either companion. Existing Git tags must resolve to the tested commit.
If source or artifacts change, use a new version.

GitHub publication uses the hosted `gh` CLI with `GH_TOKEN: ${{ github.token }}`
and job-scoped `contents: write`. New releases send all four assets in one
`gh release create`: the CLI uploads to a temporary draft and publishes its ID,
with possible draft cleanup on failure. Existing drafts/partial releases are
verified before missing assets are added; existing files are never overwritten.
Lightweight and annotated tags are resolved to commits. Resumed drafts receive
the version's prerelease status; an inconsistent published status fails preflight.

If npm succeeds but GitHub fails, npm remains published. Retry GitHub or attach
the original four tested assets manually. Do not rebuild or republish that npm
version from a newer commit.

## Browser demo on GitHub Pages

In GitHub **Settings → Pages**, choose **GitHub Actions**. Allow `main` and `v*`
in the `github-pages` environment. Official Pages actions use `GITHUB_TOKEN` and
deployment OIDC; no npm token is needed. The site is
<https://website-local.github.io/grovedom/>.

Dispatch **Actions → Browser demo** with a published tag (default `v0.1.2`).
Its release must contain the original two tarballs, checksums and `release.json`;
a newer CI artifact with the same version cannot replace them. UI release events
also trigger Pages, including prereleases. **Release** calls Pages directly after
GitHub publication because `GITHUB_TOKEN` events do not trigger another workflow.
Pushes and pull requests never deploy Pages.

Assembly verifies commit/hashes and copies the tagged demo, matching JS/Wasm and
licenses. It uploads only the demo and Wasm package, using relative URLs for
subpaths/custom domains. There is no compiler, install, native build or benchmark.
Portable normal/fallback checks use that tag's own fixtures before deployment;
actual browser support remains best-effort.

Deployments are serialized without cancelling an active one. Selecting an older
tag rolls the site back. A failed Pages deployment leaves npm and GitHub releases
intact; rerun it or dispatch that tag again without releasing another version.
