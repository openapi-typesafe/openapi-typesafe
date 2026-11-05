---
"openapi-typesafe": patch
---

New opt-in fix `read-write-refs` (`--fix read-write-refs`): `readOnly` and `writeOnly` of a schema
that a property references with `$ref` or `allOf` make the property `readonly` and count for
`--read-write-markers`, as in OpenAPI 3.0 and 3.1 (openapi-typescript #1938).
