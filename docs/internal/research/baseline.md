# Baseline (Phase 0)

Measured on 2026-11-02 at the fork base `d46a319a` (upstream `main`, 2026-09-25), before any change to source code.
Raw logs are written to `.logs/` (not committed); this file records the numbers we compare against.

## Environment

| Item | Value |
|---|---|
| OS | macOS (Darwin 27.2.0, Apple Silicon) |
| Node | 26.0.0 |
| pnpm | 10.30.3 (pinned by `packageManager`) |
| TypeScript (workspace catalog) | 5.9.3 |
| vitest | 4.1.11 |
| Coverage provider (added in task 0.2) | `@vitest/coverage-v8` 4.1.11 (matches the pinned vitest; vitest 5.0.5 is current and is evaluated in task 1.5) |

## Install, build, test

| Step | Result | Wall time |
|---|---|---|
| `pnpm install --frozen-lockfile` | OK | 6.7 s (warm store) |
| `pnpm build` (4 packages) | OK, **with warnings** (see below) | 5.4 s |
| `pnpm test` (all packages) | OK | 23.8 s |
| `test:examples` (`tsc` over 19 generated examples) | OK | 2.4 s |
| `pnpm lint` | **Fails** (see below) | — |

### Tests

| Package | Test files | Tests | Result |
|---|---|---|---|
| `openapi-typescript` | 26 | 283 | all passed |
| `openapi-fetch` | 21 | 451 | all passed |
| `openapi-react-query` | 1 | 37 | all passed |
| `openapi-typescript-helpers` | 0 | 0 | no tests (types only) |

### Coverage (`src/**`, v8 provider)

| Package | Statements | Branches | Functions | Lines |
|---|---|---|---|---|
| `openapi-typescript` | 91.19% | 88.18% | 95.37% | 91.11% |
| `openapi-fetch` | 91.76% | 89.21% | 85.36% | 91.66% |
| `openapi-react-query` | 96.77% | 88.88% | 100% | 96.66% |

Branch coverage is below the 90% target in every package (task 7.5).

### Bundle sizes

| File | Raw size | Size-limit measurement |
|---|---|---|
| `openapi-fetch/dist/index.mjs` | 17.3 kB | **7.2 kB** of 7.5 kB budget (size-limit 12: esbuild-bundled, minified, with dependencies, uncompressed). After the upgrade to size-limit 14 (rolldown) the same code measures **7.41 kB** |
| `openapi-react-query/dist/index.mjs` | 2.5 kB | not budgeted |
| `openapi-typescript/dist/index.mjs` | 4.7 kB entry chunk (84.6 kB total) | not budgeted |

## Inherited defects found during the baseline

These are not fixed in Phase 0 (the baseline must reflect the inherited state). Each one is assigned to a later task.

| # | Defect | Assigned to |
|---|---|---|
| B1 | `pnpm lint` fails: `openapi-react-query/test/index.test.tsx(619,61): error TS18046: 'error' is of type 'unknown'` | 1.7 (CI must be green) |
| B2 | Biome reports 23 lint warnings (typescript 4, react-query 8, fetch 11) | 1.7 (zero warnings, §5.11) |
| B3 | Build warns about mixed named and default exports in `src/index.ts`, `transform/components-object.ts`, `transform/operation-object.ts`, `transform/schema-object.ts` (generator) and `src/index.js` (fetch) | 1.7; generator files are rewritten in Phase 5 |
| B4 | `pnpm size` is a no-op: it runs the turbo task `size-limit`, which no package defines, so the budget is never checked. The check only runs with `npx size-limit` at the root | 1.7 (CI runs the real check) |
| B5 | Install warns about unmet peers in fetch examples (`@sveltejs/vite-plugin-svelte` and `@vitejs/plugin-vue` expect vite ≤ 6, found 7.3.1) and 6 deprecated sub-dependencies | 1.5 (toolchain review) |
| B6 | Tests print a Node 26 `ExperimentalWarning` (localStorage without `--localstorage-file`) in react-query tests | 1.7 |
| B7 | `openapi-fetch` exports `randomID` at runtime, but `index.d.ts` does not declare it | ADR-008 / 7.6 |
| B8 | The generator's public entry exports ~60 symbols, including every transformer, `enumCache` (module-level mutable state), `walk`, `resolveRef`, and the logging helpers `c`, `debug`, `error`, `warn` | 3.1 (measure use) → Phase 6 |
