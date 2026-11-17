---
"openapi-typesafe-fetch": patch
---

The `headers` option types accept any iterable of `[name, value]` pairs, such as a `Map`,
`map.entries()` or a generator, with the values a record takes. The client already sent them, but
TypeScript rejected them.
