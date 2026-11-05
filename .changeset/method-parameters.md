---
"openapi-typesafe-helpers": patch
"openapi-typesafe-fetch": patch
"openapi-typesafe-react-query": patch
---

`Parameters<typeof $api.queryOptions>` (and of `useQuery`, `useSuspenseQuery` and the fetch
client's `request`) takes the arguments of every operation; its path was `never` (upstream #2178).
`PathsWithMethod` of a union of methods is now the paths with any of them, not with all of them,
so `PathsWithMethod<paths, HttpMethod>` is every path. A known set of methods still gives the
paths that have each of them. The init in those parameters is required when some operation
requires one (`IsInitOptional`), so a helper passes `{}` for a path that needs none. A single call
is checked as before, also with a union of paths or methods.
`ReturnType` of these generic functions stays `any`; the `queryOptions` docs show what to use.
