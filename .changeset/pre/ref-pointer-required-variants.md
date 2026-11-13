---
"openapi-typesafe": patch
---

A `$ref` into a property of a schema whose `oneOf` variants only list required fields now
compiles. With `oneOf: [{ required: [email] }, { required: [phone] }]` next to `properties` (the
"one of these fields is required" pattern), or with variants that are only `{ type: object }`, a
`$ref` to `Contact/properties/owner/properties/name` was written `Contact["owner"]["name"]`, which
fails through the optional `owner` (TS2339). It is now `NonNullable<Contact["owner"]>["name"]`.
The same holds with the `anyof-oneof-required` fix.
