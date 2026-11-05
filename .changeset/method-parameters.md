---
"openapi-typesafe-helpers": patch
"openapi-typesafe-fetch": patch
"openapi-typesafe-react-query": patch
---

`Parameters<typeof $api.queryOptions>` (and of `useQuery`, `useSuspenseQuery` and the fetch
client's `request`) takes the arguments of every operation; its path was `never` (upstream #2178).
`PathsWithMethod` of a union of methods is now the paths with any of them, not with all of them,
so `PathsWithMethod<paths, HttpMethod>` is every path. The init in those parameters is optional
when some operation needs none (`IsInitOptional`). A single call is checked as before.
`ReturnType` of these generic functions stays `any`; the `queryOptions` docs show what to use.
