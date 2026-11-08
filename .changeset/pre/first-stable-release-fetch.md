---
"openapi-typesafe-fetch": major
---

First stable release of openapi-typesafe-fetch, the successor of openapi-fetch 0.17 with the same
API: change the import from `openapi-fetch`. A library that imports `openapi-fetch` itself, such as
swr-openapi, needs it aliased to this package
([how](https://openapi-typesafe.github.io/openapi-typesafe/fetch/#libraries-built-on-openapi-fetch)). From 1.0 the package follows semver.

Changes that can need work when you move from openapi-fetch 0.17:

- `engines.node` is `>=22` (server code; browsers are not affected).
- `Blob`, `File`, `ArrayBuffer`, typed array and `URLSearchParams` bodies are sent as they are; they
  were JSON-encoded to `{}`.
- An object body with `Content-Type: multipart/form-data` is sent as `FormData`, not JSON.
- A string body with a non-JSON `Content-Type` is sent as is, without JSON quotes (upstream
  [#2555](https://github.com/openapi-ts/openapi-typescript/issues/2555), [#2382](https://github.com/openapi-ts/openapi-typescript/issues/2382)).
- A nested object in a form or multipart body throws; write a `bodySerializer` for it.
- Query parameter names and object keys are percent-encoded like values (`[ ] $ : @ ,` stay).
- A path parameter that makes a `.` or `..` segment, or a path that starts with `//`, rejects
  before `fetch` is called (upstream [#2483](https://github.com/openapi-ts/openapi-typescript/issues/2483)).
- A path that already has a query string gets `&` before `params.query`, not a second `?`.
- `defaultBodySerializer` declares its real return type instead of `string`; check
  `typeof result === "string"` where you used the result as a string.
- `HttpMethod` includes `"query"`: a hand-written `Record<HttpMethod, …>` needs a `query` entry.
