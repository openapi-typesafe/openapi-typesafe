---
"openapi-typesafe-react-query": patch
---

Queries give `data: null` for every successful response without a body (also an empty chunked
body or a `HEAD` request, not only a 204 or `Content-Length: 0`), and the types say so; TanStack
Query rejected the `undefined` they gave (upstream [#2234](https://github.com/openapi-ts/openapi-typescript/issues/2234), [#2464](https://github.com/openapi-ts/openapi-typescript/issues/2464)). Mutations still give
`undefined`.
