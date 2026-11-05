---
"openapi-typesafe-helpers": patch
"openapi-typesafe-fetch": patch
"openapi-typesafe-react-query": patch
---

`Parameters<typeof $api.queryOptions>` (and of `useQuery`, `useSuspenseQuery` and the fetch
client's `request`) takes the arguments of every operation; its path was `never` (upstream #2178).
`PathsWithMethod<paths, HttpMethod>` is now every path that has some method; a known method or set
of methods still gives the paths that have each of them, as before. Code that is generic in the
paths, such as swr-openapi's hooks, compiles as with openapi-typescript's helpers. The init in those parameters is required when some operation
requires one (`IsInitOptional`), so a helper passes `{}` for a path that needs none. A single call
is checked as before, also with a union of paths or methods.
`ReturnType` of these generic functions stays `any`; the `queryOptions` docs show what to use.
