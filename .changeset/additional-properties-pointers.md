---
"openapi-typesafe": patch
---

A `$ref` to the `additionalProperties` of an object that also has `properties`
(`#/components/schemas/Stats/additionalProperties`) is typed as that schema again. Since the index
signature also takes the property types, `Stats["additionalProperties"]` read
`number | { count?: number }`, which accepted `5`, and a `$ref` one level deeper
(`.../additionalProperties/properties/count`) did not compile, also with `--fix ref-pointers`.
