---
"openapi-typesafe": patch
---

New opt-in fix `exploded-query-objects` (`--fix exploded-query-objects`, or `fix:
["exploded-query-objects"]`): a query parameter with an object schema and the default `style: form`,
`explode: true` is sent as its own keys (`?page=1&size=10`), so its properties become keys of
`query` instead of one key named after the parameter (openapi-typescript #2361). The default
`querySerializer` of `openapi-typesafe-fetch` already sends this format.
