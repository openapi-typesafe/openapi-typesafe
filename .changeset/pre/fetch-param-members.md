---
"openapi-typesafe-fetch": patch
---

Leave out `null` and `undefined` items and members of arrays and objects in every parameter style, also in the path and headers (`ids=1,null`, `filter=owner,undefined` and `x-p: a,,b,1` were sent before), and default `explode` to `true` for the `form` query style only, as OpenAPI does, so `{ array: { style: "pipeDelimited" } }` sends `id=3|4|5`. A nested value in a header parameter now fails with an error that names header parameters, not `querySerializer()`.
