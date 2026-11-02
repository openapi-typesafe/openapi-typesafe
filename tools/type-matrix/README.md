# Type matrix

Type-checks the generated examples and the clients as a consumer does, with every supported TypeScript version
(ENGINEERING_PLAN 8.1, ADR-006). Each compiler checks the consumer project twice:

| Project        | tsconfig                              | Flags                                                                                 |
| -------------- | ------------------------------------- | ------------------------------------------------------------------------------------- |
| `strict`       | `consumer/tsconfig.json`              | `strict`, `skipLibCheck: false` (the published `.d.ts` files are checked too)         |
| `strict-flags` | `consumer/tsconfig.strict-flags.json` | also `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax` |

The consumer project includes every `packages/openapi-typesafe/examples/*.ts` and `consumer/src/`, which calls the fetch client, the react-query
client and the marker helpers through their built `dist`.

| Version                | Package                                         | Blocking                          |
| ---------------------- | ----------------------------------------------- | --------------------------------- |
| 5.4 (lowest supported) | `typescript-5.4` → `typescript@5.4.5`           | yes                               |
| 5.9                    | `typescript-5.9` → `typescript@5.9.3`           | yes                               |
| 6.0                    | `typescript-6.0` → `typescript@6.0.3`           | yes                               |
| 7.0                    | `typescript-7.0` → `typescript@7.0.2`           | yes                               |
| 7.1 beta               | `typescript-7.1-beta` → `typescript@7.1.0-beta` | no: reported, never fails the run |

## Usage

Build the packages first (`pnpm build` at the root), then run from this directory with Node 22.18 or newer:

```sh
pnpm matrix                      # every version
pnpm matrix --typescript 5.4     # one version (repeatable)
```

The exit code is 0 when every blocking check passes, 1 when one fails, 2 for invalid arguments. Each run writes a
JSON Lines log to `.logs/type-matrix/` at the repository root; failed checks carry the compiler output.
