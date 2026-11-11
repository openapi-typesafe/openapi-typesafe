---
"openapi-typesafe-fetch": patch
---

`params.header` values are written in the `simple` style, the only style OpenAPI has for headers:
a `Date` as ISO 8601 (it was local time), an array as `a,b` (it was `a, b`) and an object as
`role,admin` (it was `[object Object]`), not percent-encoded, also in the names. A nested object or
array inside one throws, as in the query. An empty array or object sends no header, and `null`
still removes one.
