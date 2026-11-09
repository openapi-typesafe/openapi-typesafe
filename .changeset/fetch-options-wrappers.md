---
"openapi-typesafe-fetch": patch
"openapi-typesafe-react-query": patch
---

Wrappers generic in the path that type the init as `FetchOptions<FilterKeys<paths[P], "get">>` or
`FetchOptions<paths[P]["get"]>` compile with `client.GET` and the other methods, and with
`useQuery`, `queryOptions` and `useSuspenseQuery`, as with openapi-fetch. `FetchOptions` of a
union of operations is now the union of their inits (ADR-030).
