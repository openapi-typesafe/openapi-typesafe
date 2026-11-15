---
"openapi-typesafe": patch
---

A schema `$ref` through an `enum` or `const` schema (the `schema` of an enum parameter or header,
a `const` variant of a `oneOf`, an `enum` item of an `allOf`) or through `$defs` of an enum or
array schema is typed as the schema it points at. The index it had did not compile. A `not` next
to other keywords no longer hides them from this check.
