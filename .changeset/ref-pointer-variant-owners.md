---
"openapi-typesafe": patch
---

A `$ref` into a property of a schema with `properties` next to `oneOf` or `anyOf` now compiles.
`#/components/schemas/Pet/properties/owner/properties/name`, where `Pet` has a `oneOf` (the usual
discriminator shape), was written `Pet["owner"]["name"]`, which fails through the optional `owner`
(TS2339). It is now `NonNullable<Pet["owner"]>["name"]`. Where the type is a union whose member
does not have the property (`anyOf` without the `anyof-properties` fix), the `$ref` gets the
type it points at.
