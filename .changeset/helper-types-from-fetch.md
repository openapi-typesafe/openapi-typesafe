---
"openapi-typesafe-fetch": minor
"openapi-typesafe-react-query": patch
---

The client exports every type of `openapi-typesafe-helpers` (`PathsWithMethod`, `FilterKeys`,
`SuccessResponse`, …), declared in its own declarations, and the hooks name them through the
client; `openapi-typesafe-helpers` is no longer a dependency of the hooks. A library built with
`declaration: true` under pnpm or Yarn PnP that uses the client or the hooks gets declarations
that name `openapi-typesafe-fetch`, which it depends on: no TS2742 ("cannot be named without a
reference to …/openapi-typesafe-helpers") under pnpm, and no `import("openapi-typesafe-helpers")`
that its users cannot resolve under Yarn PnP. openapi-fetch and openapi-react-query fail the same
way. TanStack Query's own types keep two limits in a file that does not import
`@tanstack/react-query`: TS2742 under pnpm with TypeScript 5.4 (5.5 and later work), and
`import("@tanstack/query-core")` under Yarn PnP; the react-query docs ("Libraries that export
hooks") give the fixes.
