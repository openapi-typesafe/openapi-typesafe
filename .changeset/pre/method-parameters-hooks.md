---
"openapi-typesafe-react-query": patch
---

`Parameters<typeof $api.queryOptions>` and the like take every operation, so code generic in the
paths compiles (upstream [#2178](https://github.com/openapi-ts/openapi-typescript/issues/2178)).
