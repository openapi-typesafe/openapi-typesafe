# Compatibility harness

Defines what "compatible" means for openapi-typesafe (ENGINEERING_PLAN, Phase 2). It downloads a
real-world corpus of OpenAPI 3.x documents, runs generators over it, and compares their outputs.

Only the manifest (`corpus/manifest.json`, URLs and SHA-256 hashes) and the curated list
(`corpus/curated.json`, sources pinned to a commit) live in git. The documents carry their owners'
licenses and are never redistributed: they are downloaded into `.cache/compat` and verified against
the hashes.

## Commands

Run from this directory with Node 22.18 or newer (TypeScript runs natively, no build step).

```sh
pnpm harness manifest                     # rebuild corpus/manifest.json from APIs.guru + curated list
pnpm harness fetch --corpus 200           # download the CI subset (or --corpus all)
pnpm harness generate --label fork-base --cli <path/to/bin/cli.js> --option-sets all
pnpm harness generate --label current --cli ../../packages/openapi-typesafe/bin/cli.js --option-sets all
pnpm harness compare --golden fork-base --candidate current --types
pnpm harness report --golden fork-base --candidate current
```

| Option                                    | Meaning                                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `--corpus <n\|all>`                       | Deterministic subset of `n` entries (all curated + evenly spread APIs.guru), or the full corpus |
| `--option-sets <ids\|all>`                | Comma-separated option set ids (`default`, `enum`, `root-types+root-types-keep-casing`, …)      |
| `--types`                                 | Also run the strict type-identity check on outputs whose text differs                           |
| `--update-hashes`                         | Accept changed documents and record their new hashes (refreshing the corpus on purpose)         |
| `--concurrency <n>` / `--timeout-ms <n>`  | Worker count; per-run generator timeout                                                         |
| `--cache-dir <path>` / `--log-dir <path>` | Defaults: `.cache/compat`, `../../.logs/harness`                                                |

Exit codes: `0` passed, `1` the command found problems (failed downloads, mismatches), `2` invalid
arguments.

## Scripts

- `scripts/prepare-generators.sh` builds the two golden generators of task 2.2 in
  `.cache/compat/generators`: `fork-base` (a git worktree of the `fork-base` tag, built with its own
  lockfile) and `upstream-7.13.0` (the published `openapi-typescript@7.13.0` from npm), both with
  TypeScript 5.9.3. Remove the worktree with `git worktree remove .cache/compat/generators/fork-base`.
- `scripts/run-compat.sh [corpus] [option-sets]` generates with both goldens and the current build,
  then compares and reports `fork-base` vs `current` (the release gate, exit code 1 on a mismatch)
  and `upstream-7.13.0` vs `fork-base` (documentation of unreleased upstream changes).
- CI (`.github/workflows/compat.yml`) runs the 200-entry subset with default options on every pull
  request and the full matrix nightly once the repository is public.

## Logs and outputs

- Every run writes a JSON-lines log to `.logs/harness/<UTC time>-<command>.jsonl` at the repository
  root; the terminal shows the log path and a one-line result.
- `.cache/compat/outputs/<label>/<option set>/<entry>.ts`: generated files.
- `.cache/compat/results/`: per-label generation results and comparison results (JSON).
  A `generate` run replaces its label's results, so a run with another `--corpus` or `--option-sets`
  needs its own label (for example `fork-base-full`), or later comparisons see only that run's cases.
- `.cache/compat/reports/<golden>__vs__<candidate>.{md,json}`: the compatibility report.

## Comparison rules

- **Text:** after normalizing line endings, trailing whitespace, and the product name in the file
  header and the discriminator JSDoc (the fork's rename is an intended difference).
- **Types:** every exported type must be identical under
  `(<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)`. This catches `readonly`
  and `any` differences that mutual assignability misses. Enums and generic types are compared by
  declaration text.
- **Intentional differences:** bug fixes that change output on purpose (ENGINEERING_PLAN 7.4) are
  listed in `src/domain/intentional-differences.ts`, each with its upstream issues and a rewrite of
  the golden text. The comparison applies the rewrites to the golden text first, so a case that
  differs only by them counts as identical; the report lists every rewrite with the cases it changed.
- Cases where the golden generator fails are excluded from the identity rates.

## Layout

`src/domain` (pure rules) → `src/application` (ports and use cases) → `src/adapters` (Node, fetch,
TypeScript) → `src/cli` (composition root). Unit tests use the in-memory fakes in `test/fakes`;
adapter tests use a temporary directory, a local HTTP server, and a fake generator script.
