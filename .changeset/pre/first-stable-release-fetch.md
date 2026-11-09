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
- A string body is sent as is, without JSON quotes, unless its `Content-Type` is `application/json`
  or a `+json` type; line-based JSON types such as `application/x-ndjson` send it as is too
  (upstream [#2555](https://github.com/openapi-ts/openapi-typescript/issues/2555), [#2382](https://github.com/openapi-ts/openapi-typescript/issues/2382)).
- A nested object or array in a form or multipart body, also as an array item, throws; write a
  `bodySerializer` for it.
- A `Date` is sent as ISO 8601 (`toISOString()`) in every query and path style and form field. In
  an `application/x-www-form-urlencoded` body, and in a query array or object with
  `explode: false`, it was a local time text (`String(date)`); a `Date` on its own in the query or
  the path was left out (`/items/{id}` became `/items/`) and is now sent. Format it yourself if
  your server reads another format.
- Query parameter names and object keys are percent-encoded like values (`[ ] $ : @ ,` stay in
  names, not in object keys).
- A path parameter that makes a `.` or `..` segment, or a path that starts with `//`, rejects
  before `fetch` is called (upstream [#2483](https://github.com/openapi-ts/openapi-typescript/issues/2483)).
- A path that already has a query string gets `&` before `params.query`, not a second `?`.
- `defaultBodySerializer` declares its real return type instead of `string`; check
  `typeof result === "string"` where you used the result as a string.
- `FetchOptions` of a union of operations is the union of each operation's init: an init that
  mixes the parameters of one operation with the body of another no longer compiles.
- `HttpMethod` includes `"query"`: a hand-written `Record<HttpMethod, …>` needs a `query` entry.
- `Client<paths>` has a `QUERY()` method: an object written by hand with that type, such as a
  fake client in tests, needs a `QUERY` member (TS2741).
- A custom `fetch` must return a `Response` of any realm or Fetch implementation: an object
  without `ok`, `status`, `headers` and `text()`, such as a hand-written test double, throws
  `fetch: must return new Response()`, as such a result of middleware does. Return
  `new Response(body, init)` from a test double.
