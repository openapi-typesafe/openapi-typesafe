---
"openapi-typesafe": minor
---

The generator no longer needs the `typescript` package: it is now an optional peer dependency, next to the optional `@typescript/typescript6` for TypeScript 7 projects. Only legacy callbacks and the deprecated `ts.Node` helpers load it.

**Breaking compared with `openapi-typescript`:** the `inject` option is printed as written (without the blank lines around it) instead of being reformatted by the TypeScript printer, so comments in it are kept. With `--path-params-as-types`, a backtick in a URL is escaped, so the key is a valid template literal type (the original produced a broken type).
