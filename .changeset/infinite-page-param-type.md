---
"openapi-typesafe-react-query": patch
---

`useInfiniteQuery` types the page param: `lastPageParam` and `data.pageParams` get the type of
`initialPageParam` together with the return types of `getNextPageParam` and
`getPreviousPageParam`. They were `unknown` (upstream #2458, PR #2459). An annotated
`lastPageParam`, such as `(lastPage, allPages, lastPageParam: number) => lastPageParam + 1`, now
compiles. Where no type can be inferred (a return computed from an unannotated `lastPageParam`,
or only `undefined`), the page param stays `unknown`, so code that compiled still compiles.
