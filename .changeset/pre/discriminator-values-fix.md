---
"openapi-typesafe": minor
---

Add the `discriminator-values` output fix (`--fix discriminator-values`, ADR-021). Without it a
schema that a `mapping` names and that a discriminated `oneOf` without a mapping also lists gets
two discriminator properties, the mapped value and the schema name (`kind: "cat"` and
`kind: "Cat"`), which intersect to `never`. With it the values of a property merge into one enum,
and the schema name is used only where no mapping gives the schema a value. Without the fix the
output is unchanged.
