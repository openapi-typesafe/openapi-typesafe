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
pnpm harness dependents                   # real projects (ENGINEERING_PLAN 8.4), before `report`
pnpm harness report --golden fork-base --candidate current
```

| Option                                    | Meaning                                                                                                         |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `--corpus <n\|all>`                       | Deterministic subset of `n` entries (all curated + evenly spread APIs.guru), or the full corpus                 |
| `--option-sets <ids\|all>`                | Comma-separated option set ids (`default`, `enum`, `root-types+root-types-keep-casing`, …)                      |
| `--types`                                 | Also run the strict type-identity check on outputs whose text differs                                           |
| `--update-hashes`                         | Accept changed documents and record their new hashes (refreshing the corpus on purpose)                         |
| `--concurrency <n>` / `--timeout-ms <n>`  | Worker count; per-run generator timeout (per step for `dependents`, default 10 minutes)                         |
| `--projects <ids>` / `--work-dir <path>`  | `dependents` only: comma-separated project ids; work directory (default: system temp)                           |
| `--switch names\|migrate`                 | `dependents` only: rename by package name (default), or run `openapi-typesafe-migrate --write` (build it first) |
| `--cache-dir <path>` / `--log-dir <path>` | Defaults: `.cache/compat`, `../../.logs/harness`                                                                |

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
  declaration text. A case where every golden type is identical and the candidate only exports
  more names is `types-added`: it counts for the **kept types** rate (what an existing user of the
  golden output can rely on), not for type identity.
- **Intentional differences:** bug fixes that change output on purpose (ENGINEERING_PLAN 7.4) are
  listed in `src/domain/intentional-differences.ts`, each with its upstream issues and a rewrite of
  the golden text. The comparison applies the rewrites to the golden text first, so a case that
  differs only by them counts as identical; the report lists every rewrite with the cases it changed.
- **Golden output that does not compile:** with `--types`, a case whose golden types differ is
  `golden-invalid` when the golden file does not compile on its own (strict, no ambient types) and
  the candidate has no more errors: a fix of invalid output, which the backlog policy ships by
  default. With more errors it stays `different`.
- Cases where the golden generator fails or its output does not compile are excluded from the
  identity rates.

## Real projects

`pnpm harness dependents` checks the open-source projects of `corpus/dependents.json`, each pinned to
a commit. Only the manifest lives in git; the projects are cloned into the work directory, which is
outside this repository so their package managers do not see the openapi-typesafe workspace.

1. The openapi-typesafe packages are packed with `pnpm pack`, and the dependencies between them are
   pointed at the other tarballs, because the packages are not on a registry.
2. Each project runs twice from a fresh git worktree: as it is (baseline), and switched to
   openapi-typesafe by package name only (candidate). The switch renames the packages in every
   `package.json`, the generator command in scripts, and quoted module specifiers in source files.
   The baseline pins the original packages to the upstream releases the fork starts from
   (`UPSTREAM_BASE_VERSIONS`), so the two runs differ by the switch alone: a project on an older
   upstream release can break on upstream changes (openapi-fetch 0.13 → 0.17, for example), and
   that is not a difference of openapi-typesafe.
3. Each run installs with lifecycle scripts disabled and then runs the project steps of the
   manifest in order. A project that fails on the upstream releases reports `baseline-failed`: its
   entry needs work. A step that passes on upstream and fails after the switch reports `regressed`.
4. Files the steps generate are compared between the runs like corpus outputs.

The commands run with a reduced environment (`PATH`, `HOME`, `TMPDIR`, `USER`, plus `CI=1`,
`LANG=en_US.UTF-8` and `TZ=UTC` like a CI runner), so tokens of the calling shell never reach
third-party scripts. Run the command with Node.js 24 (the active LTS, which the projects' own CI
uses) first on `PATH`: on Node.js 26 some project tests fail on their own, because of the
`module.register()` deprecation warning and the Web Storage globals. Bun projects need `bun` on
`PATH`.
Each step writes its full output to `.logs/harness/<run>-dependents/<project>/<variant>/<step>.log`;
results go to `.cache/compat/results/dependents.json` and into the "Real projects" section of the
next report. Checkouts of passed projects are deleted; failed ones stay for inspection.

To add a project, pin its current commit, list the steps its CI runs that work offline (generate,
type-check, build, unit tests), and note in `notes` why steps were left out.

## Layout

`src/domain` (pure rules) → `src/application` (ports and use cases) → `src/adapters` (Node, fetch,
TypeScript) → `src/cli` (composition root). Unit tests use the in-memory fakes in `test/fakes`;
adapter tests use a temporary directory, a local HTTP server, and a fake generator script.
