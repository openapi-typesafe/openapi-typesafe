---
"openapi-typesafe-react-query": patch
---

New `infiniteQueryKey(queryKey, pageParamName?)` writes the key of a `useInfiniteQuery` query
from `queryOptions(...).queryKey`, typed as `InfiniteQueryKey`, for `getQueryData` and
`setQueryData`. `[...queryKey, "infinite"]` gives the same key but does not type-check as an
`InfiniteQueryKey`.
