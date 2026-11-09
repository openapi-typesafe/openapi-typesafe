---
"openapi-typesafe": major
---

First stable release of openapi-typesafe, the successor of openapi-typescript 7.13. The package and
the command are now `openapi-typesafe`; `npx openapi-typesafe-migrate --write` moves a project over
([migration guide](https://openapi-typesafe.github.io/openapi-typesafe/migration-guide)). Flags, `redocly.yaml` settings, the Node API and the
output of valid schemas stay those of 7.13, except the changes below, output that did not compile,
and the opt-in `--fix` list. From 1.0 these contracts follow semver
([versioning](https://openapi-typesafe.github.io/openapi-typesafe/compatibility#versioning)).

Highlights: no TypeScript dependency (the generator runs next to TypeScript 7), OpenAPI 3.2
support, typed errors and exit codes, a code on every warning, 17 opt-in output fixes, and limits
for documents you did not write.

Changes that can need work when you move from openapi-typescript 7.13:

- Node.js 22.12 or newer (`engines.node`).
- The header of generated files and the comment of added discriminator properties name
  `openapi-typesafe`: regenerate once, or `--check` fails on the old files.
- A string enum with `additionalProperties: true` gets `| (string & {})` (see Minor Changes).
- Exit codes: `1` stale `--check` output (as before), `2` usage or configuration, `3` input
  document, `4` output files, `70` unexpected error. Every failure used to exit with `1`.
- `--check` without an output file fails with `CLI_CHECK_OUTPUT_MISSING`; it passed unchecked.
- Undocumented CLI flags such as `--silent` no longer reach the Node API.
- `openapiTS()`, the `ts*` helpers, the type constants (`STRING`, `NULL`, …) and the exported
  transformers return IR, not TypeScript nodes. `astToString()` prints the same text as before.
- Node API errors are `OpenAPITypesafeError`s with a `code`; a file system error is the `cause`
  (`error.cause.code === "ENOENT"`).
- `typescript` is an optional peer, and it needs TypeScript 5.4 or newer (`>=5.4.0`, was `^5.x`).
  On TypeScript 5.0 to 5.3 npm stops with a peer conflict (`ERESOLVE`) and pnpm warns: upgrade
  TypeScript to 5.4 or newer. Legacy `ts.Node` callbacks need `typescript` 6 or earlier, or
  `@typescript/typescript6` in a TypeScript 7 project.
- Relative `$ref`s of a string, object, buffer, stream or stdin source resolve in `cwd`, not in its
  parent.
- `inject` is printed as written, comments included.
- In `redocly.yaml`, an `x-openapi-ts` setting of the wrong type (`root-types: "true"`) fails that
  API with `CLI_CONFIG_INVALID`; openapi-typescript ignored it.
- Headers from `resolve.http.headers` go over plain HTTP only to `localhost`, `127.0.0.1` and
  `::1`, or to a pattern that starts with `http://`.
