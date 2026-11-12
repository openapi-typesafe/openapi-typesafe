---
"openapi-typesafe": patch
---

A `$ref` to `#/components/schemas/<Name>/unevaluatedProperties` now gets the type of that schema.
Without `--fix=unevaluated-properties` it was `<Name>["unevaluatedProperties"]`, which fails with
TS2339 (or is `never` for an object with no other keywords); with that fix it compiled but read the
index signature, which also holds the types of the declared properties, so it accepted values the
schema does not allow.
