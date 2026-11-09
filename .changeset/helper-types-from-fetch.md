---
"openapi-typesafe-fetch": minor
---

The client declares the helper types (`PathsWithMethod`, `FilterKeys`, `SuccessResponse`, …) in
its `openapi-typesafe-fetch/helpers` entry, and `openapi-typesafe-helpers` re-exports them. The
names of both packages are one declaration, so they mix, also in generic code: `Readable<T>` of one
package fits `Readable<T>` of the other. A library built with `declaration: true` under pnpm or
Yarn PnP that uses the client gets declarations that name `openapi-typesafe-fetch/helpers`, of a
package it depends on, under every `moduleResolution` (also `node10`): no TS2742 ("cannot be
named without a reference to …/openapi-typesafe-helpers") under pnpm, and no `import("openapi-typesafe-helpers")` that its users
cannot resolve under Yarn PnP. openapi-fetch fails the same way. The main entry exports the names
of openapi-fetch and no helper type, so `export type * from "openapi-typesafe-fetch"` next to a
type of the same name still compiles. The client no longer depends on `openapi-typesafe-helpers`,
so it has no runtime dependency.
