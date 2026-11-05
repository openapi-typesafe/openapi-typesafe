---
"openapi-typesafe-react-query": patch
---

`useQuery`, `useSuspenseQuery` and `queryOptions` give `data: null` for every successful response
without a body. Only a 204 and `Content-Length: 0` did; an empty chunked body and a HEAD request
gave `undefined`, and TanStack Query failed with "Query data cannot be undefined" (upstream #2234).
