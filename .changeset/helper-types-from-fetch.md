---
"openapi-typesafe-fetch": minor
---

The client declares the helper types (`PathsWithMethod`, `FilterKeys`, `SuccessResponse`, …) and
exports them, and `openapi-typesafe-helpers` re-exports them. The names of both packages are one
declaration, so they mix, also in generic code: `Readable<T>` of one package fits `Readable<T>` of
the other. A library built with `declaration: true` under pnpm or Yarn PnP that uses the client
gets declarations that name `openapi-typesafe-fetch`, which it depends on: no TS2742 ("cannot be
named without a reference to …/openapi-typesafe-helpers") under pnpm, and no
`import("openapi-typesafe-helpers")` that its users cannot resolve under Yarn PnP. The client no
longer depends on `openapi-typesafe-helpers`, so it has no runtime dependency. openapi-fetch fails
the same way.
