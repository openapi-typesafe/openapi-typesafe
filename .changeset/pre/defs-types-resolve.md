---
"openapi-typesafe": patch
---

`$defs` types: the root `$defs` has one member per subschema, so `#/$defs/<name>` refs are no
longer `never` (upstream [#2664](https://github.com/openapi-ts/openapi-typescript/issues/2664)). A schema's own `$defs` is optional: see Major Changes.
