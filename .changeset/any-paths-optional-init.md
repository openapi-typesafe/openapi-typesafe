---
"openapi-typesafe-fetch": patch
---

`createClient<any>()` no longer requires an init argument: `client.GET("/users/me")` compiles.
`RequestBodyOption<any>` was `{ body?: never } | { body: any }`, so `body` counted as required
(upstream #2526). It is now `{ body?: any }`.
