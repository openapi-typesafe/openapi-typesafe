# Phase 8.4: real dependent projects

`pnpm harness dependents` runs 15 open-source projects twice from a pinned commit:

- **baseline**: the original packages pinned to the fork-base releases
  (openapi-typescript 7.13.0, openapi-fetch 0.17.0, openapi-react-query 0.5.4,
  openapi-typescript-helpers 0.1.0);
- **candidate**: the same tree switched to the packed openapi-typesafe tarballs by package name
  only (dependencies, module specifiers and the `openapi-typescript` command in scripts).

Run on 2026-11-02 with Node.js 24: **15 passed, 0 regressed, 0 failed before the switch.**
All 12 generated files are byte-identical after the product name in the header is normalized.

## Projects left out or narrowed

| Project | Decision | Reason |
| --- | --- | --- |
| tolgee-cli | left out | Fails on the baseline: openapi-fetch 0.17.0 gives TS2589 and implicit `any` where the project pins 0.13.1. An upstream breaking change, not ours. |
| extract | left out | Its `tsc` script is broken at the pinned commit. |
| swr-openapi | typecheck only | Its lockfile pairs a vitest and vite that do not run together. |
| permit-cli | typecheck only | Its Ink UI tests are flaky on both variants. |
| immich-discord-bot | one spec excluded | The RSS spec needs the macOS-only address 127.0.0.2. |
| arena-cli | explicit test list | `registry.test.ts` calls a live API. |

## Environment

Node.js 26 deprecates `module.register` (DEP0205) and enables Web Storage by default; both break
several projects' own tests on the baseline. The run uses Node.js 24 first on `PATH`. Bun
projects need `bun` on `PATH`. Commands run with `CI=1`, `LANG=en_US.UTF-8` and `TZ=UTC`.

## With the migration tool (ENGINEERING_PLAN 10.1)

`pnpm harness dependents --switch migrate` makes the candidate switch with
`openapi-typesafe-migrate --write`, as a user runs it, and then points the new packages at the
packed tarballs. The baseline is unchanged.

Run on 2026-11-02 with Node.js 24: **15 passed, 0 regressed, 0 failed before the switch.** All
12 generated files are byte-identical after the header is normalized.

Over the 15 projects the tool made 35 dependency renames, 55 module specifier renames and 14
command renames, and reported 3 renamed peer dependencies (correct: those packages' users must
switch too).

The first run found two faults, both fixed before the run above:

| Fault | Fix |
|---|---|
| `pnpm-lock.yaml` was read as a CI file, so lock entries such as `openapi-typescript@7.13.0` were reported as pinned commands (12 false manual steps; nothing was written) | Lockfiles are skipped: the install writes them again |
| org-roam-ui-lite passes `transform: customTransform`, a module-level arrow function with a declared `import("typescript").TypeNode` return type; the tool only knew inline functions | A transform named by a module function (or function declaration) is followed, and a declared return type is removed, since it names TypeScript nodes. A function also used elsewhere in the file is left and reported |

After the fix the org-roam-ui-lite transform is rewritten to return `"Uint8Array"` with
`irCallbacks: true`; its generated `api.d.ts` is identical to the baseline's, and its type check
and tests pass.
