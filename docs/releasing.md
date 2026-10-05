# GitHub CI and releases

CI runs on pull requests, pushes to `main`, and manual dispatch. `verify.yml`
is shared by CI and releases, so publishing requires the same build and test jobs:

- Pinned Lexbor source fingerprint and SHA-256-verified WASI SDK 25 libraries.
- Wasm built on Ubuntu 24.04 with Clang 19; native built on Ubuntu 22.04 with
  Clang 15. Hosted jobs provision their compiler packages; local build scripts
  still install no toolchains.
- Full Linux tests on the exact Node 22.0.0 floor and maintained Node 22/24,
  including all Wasm heap modes, plus pooled Wasm on Windows and macOS/Node 24.
- Native ASan/UBSan, leak detection, owned-buffer failure checks, bounded seeded
  fuzzing, declarations and portable browser module checks.
- Separate packages packed once, then installed offline into empty consumers
  on Linux, Windows and macOS. No Cheerio or install scripts are needed.

Actions are pinned to commit IDs. Dependabot groups monthly action updates into
one PR. Node declarations stay on major 22; TypeScript stays on major 6 until the
type-check scripts support its replacement for the `typescript/bin/tsc` entry.
Pull requests receive no release credentials; default token permissions are
read-only. No benchmark runs on shared CI hosts. Hosted CI passed for the initial
0.1.0 artifacts, and both npm packages match those validated tarballs. Actual
Chromium/Firefox/WebKit checks remain future work.

Verification uses ten runner jobs: two builds, one sanitizer job, package
assembly, five OS/Node test groups and the final gate. Linux groups cover Node
22.0.0, 22 and 24; Windows and macOS each use one Node 24 job. Grouping removes
duplicate runner setup without dropping the ten runtime configurations or four
packaged-install configurations. Each runtime configuration runs in a fresh
process. All checks in a group are attempted, and any failure fails the job.
Runtime checks still run if packaging fails; a runtime failure does not skip
available package-install checks.
The identical Node 22 declaration check runs once; both fuzz backends retain
their 200 cases. npm caches only downloaded packages, keyed by the lockfile;
dependency installation still uses `npm ci`, and binaries are rebuilt every run.

For local validation, configure existing build directories, `TMPDIR` and
`GROVEDOM_FUZZ_DIR` as described in [setup](prototype.md), then run:

```sh
npm run ci:pack -- /scratch/release
npm run ci:test -- all-heaps both /scratch/release/tarballs
```

`all-heaps` requires Linux native artifacts. Use `portable wasm` instead for a
pooled-Wasm-only check. The local command uses the current Node version; it does
not substitute for the other OS/runtime jobs.

## Packages and platform scope

Keep the source workspace private. Normal package assembly preserves
`private: true`. `npm run ci:pack -- OUTPUT` uses the explicit `--publishable`
assembly mode, checks release artifacts and standalone types, and creates:

| Package | Artifact and scope |
|---|---|
| `grovedom` | Wasm-first Node package and best-effort async browser entry; the same binary for both |
| `grovedom-native` | Optional Linux x64/glibc binary, built on Ubuntu 22.04; glibc 2.35 or later |

The native manifest restricts OS, CPU and libc. ARM64, musl/Alpine, Windows and
macOS native builds are not shipped. Use the main Wasm package there. Building
locally on a newer system does not produce the CI native compatibility baseline.
Both package versions stay **0.1.0**. Future releases require committing matching
versions in both manifests and updating the root lockfile first.

## First npm publish

npm has no **Create package** button. A successful first `npm publish` creates
the package named in its manifest. GitHub repository ownership does not reserve
an npm name. Sign in to npm, verify your email, enable 2FA, and ensure that your
account can publish the unscoped names `grovedom` and, optionally, `grovedom-native`.
Name availability is decided by npm at publication time.

1. Push the reviewed workflows to the repository's default `main` branch and
   wait for CI to pass. Workflow dispatch appears under **Actions → Release**.
2. In GitHub **Settings → Environments**, create `npm` and `release`. Restrict
   deployment branches to `main`; required reviewers are recommended. Set the
   branch protection required status to the reusable workflow's `gate` job after
   its first run makes the exact check name available.
3. For the first publication, create an npm granular access token with package
   read/write access that permits creating these packages. A token restricted to
   existing selected packages cannot bootstrap a new name. Automated token
   publication needs npm's bypass-2FA capability; use a short expiry and revoke
   the bootstrap token after trusted publishing works. Store it as **NPM_TOKEN**
   in the GitHub **npm environment**, never in the repository.
4. Run **Release** on `main`, version `0.1.0`, `npm_packages: wasm` (or `both`),
   `npm_tag: latest`, and `npm_auth: token`. Approve environment deployments if
   reviewers were configured. The workflow builds and tests before publication.

The default `npm_packages: none` creates a GitHub release with tarballs and
checksums, without publishing to npm. A dispatch authorizes the selected release
actions; a push or pull request alone never publishes. The workflow does not
alter versions, create npm accounts, reserve names or configure external settings.

## Trusted publishing after bootstrap

On npm, open each published package's **Settings → Trusted publishing**, choose
GitHub Actions and configure:

| Field | Value |
|---|---|
| Organization or user | `website-local` |
| Repository | `grovedom` |
| Workflow filename | `release.yml` |
| Environment | `npm` |

Use the publishing workflow filename, not `verify.yml`. Each package needs its
own configuration. Future releases select `npm_auth: oidc`; the workflow grants
`id-token: write` only to the npm job and uses a pinned npm CLI with OIDC support.
No npm token is needed for that path. Public publishing requests provenance and
sets the selected dist-tag. See npm's [trusted publisher documentation](https://docs.npmjs.com/trusted-publishers/).

Versions such as `0.1.1-alpha.1` require `npm_tag: next`; they create GitHub
prereleases. Source manifests remain private even when generated tarballs are
publishable. Do not run `npm publish` from the source checkout.

## Artifacts and retries

`npm-tarballs` contains both packages, `SHA256SUMS` and `release.json` recording
the source commit and npm integrity values. Publishing consumes those tested
tarballs without rebuilding or running lifecycle scripts. The GitHub release is
created only after successful validation and any selected npm publication.

Publishing two packages is not atomic. If one succeeds and the other fails,
rerun the failed jobs to reuse the same artifacts. An existing npm version is
accepted only if its integrity matches exactly; different bytes fail rather than
overwriting or silently skipping. Matching versions get the requested dist-tag.
An existing Git tag must identify the same commit. npm versions are immutable;
if source or artifacts need changing, commit a new version instead.

GitHub publication uses the official [GitHub CLI](https://cli.github.com/manual/gh_release_create)
already installed on hosted runners. `GH_TOKEN: ${{ github.token }}` authenticates
it with the job's `contents: write` permission; no interactive login or personal
GitHub token is needed.

New releases pass all four assets to one `gh release create` command. The CLI
creates a temporary draft, uploads the assets, then publishes using that release's
ID. It may clean up its temporary draft on failure. Existing drafts and partial
manual releases are verified before missing assets are uploaded, without
overwriting existing files. Tag verification resolves lightweight and annotated
Git tags to the tested commit; `target_commitish` alone can be a branch name.

If npm succeeded but GitHub publication failed, the npm version stays published.
For a manually completed GitHub release, attach both tested `.tgz` files,
`SHA256SUMS` and `release.json` from that run's `npm-tarballs` artifact. Do not
rebuild or republish the same npm version from a newer commit.
