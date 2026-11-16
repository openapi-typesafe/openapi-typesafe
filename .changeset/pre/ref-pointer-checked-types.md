---
"openapi-typesafe": patch
---

A schema `$ref` into another schema now gets the type it points at wherever the old type did not compile, also in shapes the generator could not read before: an object with a `oneOf` of strings, a schema with both `anyOf` and `oneOf`, a `type` list, a `oneOf` of `null`, and a property of a media type named `content`. The generator checks each such type against the types it writes. This holds with `--fix ref-pointers` and `--fix all` too. A type that compiles stays as it was.
