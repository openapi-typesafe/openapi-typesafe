---
"openapi-typesafe": patch
---

A schema `$ref` into the keywords of another schema, such as
`#/paths/~1a/get/responses/200/content/application~1json/schema/items/properties/time` or
`#/components/schemas/Base/allOf/0/properties/id`, was indexed by the keyword names
(`["schema"]["items"]`), which the generated types do not have, and the output did not compile
(TS2339). The `schema` of a media type, header or component parameter is now left out, `items` is
indexed by `number` and `additionalProperties` by `string` (through `NonNullable`, so an optional
or nullable array works), `allOf` members are merged, `anyOf` and
`oneOf` members narrow the union with `Extract`, and a property named `properties` is kept. Output
that compiled stays the same.
