---
"openapi-typesafe": patch
---

A `$ref` into a property of a schema with `type: [object]` (a list of one type) next to `anyOf` or
`oneOf` variants is now typed as for `type: object`: where a variant misses the property, the
`$ref` gets the property's type instead of an index that does not compile (TS2339).
