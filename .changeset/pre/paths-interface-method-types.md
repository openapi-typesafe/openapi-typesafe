---
"openapi-typesafe-fetch": patch
"openapi-typesafe-react-query": patch
---

The method types take the generated `interface paths`: `UseQueryMethod`, `UseSuspenseQueryMethod`,
`UseInfiniteQueryMethod`, `UseMutationMethod`, `QueryOptionsFunction`, `QueryKey`,
`InfiniteQueryKey`, `ClientMethod` and `ClientRequestMethod` required
`Record<string, Record<HttpMethod, {}>>`, which an interface does not satisfy (TS2344, upstream
#2267). They now take any `Paths`, like `OpenapiQueryClient` and `Client`. `PathOperation` is the
new exported lookup of an operation; `MaybeOptionalInit` takes any key as its location.
