---
"openapi-typesafe-fetch": minor
---

The client exports every type of `openapi-typesafe-helpers` (`PathsWithMethod`, `FilterKeys`,
`SuccessResponse`, …), declared in its own declarations. A library built with
`declaration: true` under pnpm or Yarn PnP that uses the client gets declarations that name
`openapi-typesafe-fetch`, which it depends on: no TS2742 ("cannot be named without a reference to
…/openapi-typesafe-helpers") under pnpm, and no `import("openapi-typesafe-helpers")` that its
users cannot resolve under Yarn PnP. openapi-fetch fails the same way.
