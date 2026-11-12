---
"openapi-typesafe-react-query": patch
---

`useInfiniteQuery` with a `pageParamName` other than `"cursor"` now has it in its query key, as
`[method, path, init, "infinite", { pageParamName }]`. Two infinite queries that differed only in
`pageParamName` send different requests but shared one cache entry, so the second showed the
pages of the first. Keys of queries with the default name stay the same.
