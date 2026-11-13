---
"openapi-typesafe-react-query": patch
---

`infiniteQueryKey(key)` with a TanStack Query `QueryKey`, or a key of another length than the keys
of `queryOptions`, is typed as a readonly array that ends with `"infinite"`. It was `never`.
