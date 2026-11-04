---
"openapi-typesafe-react-query": patch
---

The data types of `useQuery`, `useSuspenseQuery` and `queryOptions` say `null` for a successful
response without a body, the value `queryFn` gives. A 204 was typed `undefined`, which the query
data never is (upstream #2464). `select` gets `Body | null` for an operation with a 200 and a 204.
`useInfiniteQuery` and `useMutation` are unchanged.
