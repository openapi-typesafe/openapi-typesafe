---
"openapi-typesafe-react-query": patch
---

Headers given as `map.entries()`, a generator or a list with an iterator as a pair are sent by every
request of a query: a refetch, a retry, the next page of `useInfiniteQuery` and a retry of
`useMutation`. Before, only the first request sent them. They are now part of the query key, so
queries with different such headers no longer share a cache entry.
