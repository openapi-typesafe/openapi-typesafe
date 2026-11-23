# TypeScript version matrix for consumers (input for ADR-006)

Measured on 2026-11-02 with the current build of all packages.

## Setup

A consumer project with `strict: true`, `moduleResolution: "Bundler"`, **`skipLibCheck: false`** (so the published
`.d.ts` files are checked too) and `noEmit`. It type-checks:

- every generated example in `packages/openapi-typesafe/examples/` that the inherited examples check includes
  (all except `digital-ocean-api.ts` and `enum-root-types.ts`, which the inherited `tsconfig.examples.json`
  also excludes);
- a client file that calls `createClient<paths>()` and `client.GET()` with the GitHub API types, resolving
  `openapi-typesafe-fetch` and `openapi-typesafe-helpers` to their built `dist/index.d.mts`.

## Results

| TypeScript | Result |
|---|---|
| 5.0.4 | 4 errors |
| 5.1.6 | 4 errors |
| 5.2.2 | 4 errors |
| 5.3.3 | 4 errors (0 with `skipLibCheck: true`) |
| 5.4.5 | pass |
| 5.5.4 | pass |
| 5.6.3 | pass |
| 5.7.3 | pass |
| 5.8.3 | pass |
| 5.9.3 | pass |
| 6.0.3 | pass |
| 7.0.2 | pass |

All errors on 5.0–5.3 are the same `TS2344` in the client and helpers declarations:
`Type 'ResponseObjectMap<T>' does not satisfy the constraint 'Record<string | number, any>'`
(`openapi-typesafe-fetch/dist/index.d.mts` lines 101 and 107, `openapi-typesafe-helpers/dist/index.d.mts` lines
139 and 140). Generated output itself has no errors on any version.

This measures consumers of the output. The generator itself still crashes on TypeScript 7 at runtime (it uses the
compiler API); that is what Phases 4–6 remove.
