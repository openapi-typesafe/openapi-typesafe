---
"openapi-typesafe": patch
---

A `$ref` into a property of a schema with a `discriminator`, such as
`#/components/schemas/Pet/properties/owner/properties/name` or `Pet/properties/tags/items`, now
compiles without `--fix`. It was written as `Pet["owner"]["name"]` or `Pet["tags"]["items"]`, which
fails with TS2339; it now gets `NonNullable<Pet["owner"]>["name"]` and
`NonNullable<Pet["tags"]>[number]`, as for a schema without a `discriminator`.
