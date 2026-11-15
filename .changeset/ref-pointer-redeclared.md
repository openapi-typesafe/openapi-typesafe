---
"openapi-typesafe": patch
---

A schema `$ref` to a property that an `allOf`, `anyOf` or `oneOf` part of its owner also declares now gets the property's own type. Before, the type read both declarations together, which could have fewer values than the property (`"a"` instead of `"a" | "c"`) or not compile at all. Where the part declares the same schema, or a plain string, number, integer or boolean, the type stays as it was.
