---
"openapi-typesafe": patch
---

The package's declarations type-check with TypeScript 7 and `skipLibCheck: false`. They named the
compiler-node types of the legacy callbacks and helpers as `ts.Node`, `ts.TypeNode` and so on,
which TypeScript 7's `typescript` package does not have: importing `openapi-typesafe` gave 23
errors TS2694. The types are now read from the installed `typescript`: with TypeScript 5 and 6
they are its own node types, as before; with TypeScript 7 they are `any`, as they already were
with `skipLibCheck: true` (ADR-032). Four errors from `@redocly/openapi-core`'s declarations
remain, as in openapi-typescript 7.13; docs/typescript-7.md says how to avoid them.
