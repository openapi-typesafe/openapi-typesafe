---
"openapi-typesafe-helpers": major
---

First stable release of openapi-typesafe-helpers, the successor of openapi-typescript-helpers
0.1.0. From 1.0 the package follows semver.

Changes that can need work when you move from openapi-typescript-helpers 0.1.0:

- `engines.node` is `>=22`.
- `HttpMethod` includes `"query"`: a hand-written `Record<HttpMethod, …>` needs a `query` entry.
