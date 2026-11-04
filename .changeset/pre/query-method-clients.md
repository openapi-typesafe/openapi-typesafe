---
"openapi-typesafe-helpers": minor
"openapi-typesafe-fetch": minor
"openapi-typesafe-react-query": minor
---

The OpenAPI 3.2 `QUERY` method: `HttpMethod` includes `"query"`, the fetch client has
`client.QUERY(url, { body })` (also through `request("query", …)` and the path-based client), and
the react-query hooks accept `"query"`. A `Record<HttpMethod, …>` written by hand needs a `query`
entry. The path-based client maps only HTTP method keys, so `parameters` no longer shows up as a
`PARAMETERS()` call that always failed.
