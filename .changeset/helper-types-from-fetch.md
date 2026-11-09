---
"openapi-typesafe-fetch": minor
---

The client re-exports every type of `openapi-typesafe-helpers` (`PathsWithMethod`, `FilterKeys`,
`SuccessResponse`, …). A library built with `declaration: true` under pnpm or Yarn PnP that uses
the client or the react-query hooks no longer fails with TS2742 ("cannot be named without a
reference to …/openapi-typesafe-helpers"): TypeScript names the helper types through
`openapi-typesafe-fetch`, which such a library has. openapi-fetch and openapi-react-query fail
the same way.
