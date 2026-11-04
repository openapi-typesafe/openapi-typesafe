---
"openapi-typesafe-react-query": minor
---

`useInfiniteQuery` gets its own query key, `[...queryKey, "infinite"]` (type
`InfiniteQueryKey`), so `useQuery` and `useInfiniteQuery` for the
same request no longer share a cache entry and crash (openapi-typescript #2184). `[method, path]`
and the `queryOptions` key still match it as a prefix in `invalidateQueries`; code that reads or
writes the infinite entry with the exact `queryOptions` key must append `"infinite"`.

An `undefined` page param, such as the first page with `initialPageParam: undefined`, is left out
of the request instead of being sent as `0` (openapi-typescript #2715, #2340). ADR-022.
