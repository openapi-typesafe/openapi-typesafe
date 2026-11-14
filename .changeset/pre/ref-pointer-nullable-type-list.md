---
"openapi-typesafe": patch
---

A `$ref` into a property of a schema with `type: [object, "null"]` and `anyOf` variants that do
not have the property now gets the property's type; before, it was
`NonNullable<NonNullable<Contact>["owner"]>["name"]`, which does not compile, also with
`--fix ref-pointers`.
