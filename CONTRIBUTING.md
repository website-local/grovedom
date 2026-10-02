# Contributing

GroveDOM is currently a design and research project. Start with the [design](docs/design.md), [benchmark contract](docs/benchmarks.md), and [roadmap](docs/roadmap.md). Build and test commands will be defined with the first implementation milestone.

## Public repository content

Every committed file must be suitable for public distribution. This applies to documentation, code, fixtures, generated output, and commit messages.

- Use repository-relative paths or portable placeholders. Do not commit absolute developer paths, home directories, usernames, hostnames, private addresses, proxy settings, hardware inventories, or storage layouts.
- Keep machine audits, raw diagnostic logs, installation histories, session transcripts, agent instructions, and personal notes in ignored local directories.
- Use public dependency versions and source links for technical evidence. Describe required toolchains and supported targets instead of a contributor's installed tools.
- Review benchmark output before committing it. Keep exact machine details private; publish portable reproduction instructions and use anonymous environment labels for results.
- Commit only fixtures and third-party material with appropriate redistribution rights. Exclude credentials, private data, unreviewed downloads, and archives.
- Public documentation must stand on its own. Do not link to ignored experiments or depend on private notes for evidence of correctness or performance.

Before committing, inspect `git diff --cached --check`, `git diff --cached`, and `git diff --cached --name-only`. Confirm that every staged path is intentional and that relative documentation links resolve within the staged tree. Ignore rules are a safeguard, not a substitute for reviewing content; never force-add private artifacts.

## Technical changes

Preserve the performance, compatibility, memory, and simplicity requirements in the design. Prefer small reproducible experiments and deterministic replay to network workloads. Keep build tooling minimal, and run checks appropriate to the change. Clearly distinguish proposals, upstream-reported results, and measurements reproduced by the project.
