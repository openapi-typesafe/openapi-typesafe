---
"openapi-typesafe-react-query": patch
---

A library that exports a `$api.queryOptions(...)` result gets declarations that its users can
read: the tagged `queryKey` is typed with the exported `QueryKeyWithDataTag` (TanStack Query's
type of that name, for every version of the peer range). The declarations spelled out TanStack's
`[dataTagSymbol]` keys without an import, so the library's users failed with TS2304, or got `any`
from `queryClient.getQueryData(options.queryKey)` with `skipLibCheck`.
