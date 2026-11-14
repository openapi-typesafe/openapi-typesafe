---
"openapi-typesafe-fetch": patch
---

An optional `parseAs` with only some values, such as a wrapper's `options: { parseAs?: "text" }`
passed to `client.GET()`, types `data` as the body of each value or the JSON body (`string | T`),
as the client returns it. Before, it was typed as the JSON body only. Options whose `parseAs` may
be any value, or that have none, still type `data` as the JSON body. With and without
`exactOptionalPropertyTypes`.
