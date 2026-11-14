---
"openapi-typesafe": patch
---

A `$ref` into a property of a schema whose own `properties` sit next to `anyOf` variants of only
`type: object` (`{ type: object, required: [email] }`, `{ type: object, title: A }`), or next to
such `oneOf` variants inside an `allOf` item, now reads through the own properties
(`NonNullable<Contact["owner"]>["name"]`); before, it kept `Contact["owner"]["name"]`, which does
not compile.
