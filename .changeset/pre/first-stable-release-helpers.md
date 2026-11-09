---
"openapi-typesafe-helpers": major
---

First stable release of openapi-typesafe-helpers, the successor of openapi-typescript-helpers
0.1.0. From 1.0 the package follows semver.

Changes that can need work when you move from openapi-typescript-helpers 0.1.0:

- `engines.node` is `>=22`.
- `HttpMethod` includes `"query"`: a hand-written `Record<HttpMethod, …>` needs a `query` entry.
- `openapi-typesafe-fetch` declares the helper types in its `helpers` entry, and this package
  re-exports them, so it depends on the client. A library built with `declaration: true` under
  Yarn PnP that depends only on this package, and exports an inferred type that prints a helper
  type, gets `import("openapi-typesafe-fetch/helpers")` in its declarations: add
  `openapi-typesafe-fetch` to its dependencies, or annotate the type.
