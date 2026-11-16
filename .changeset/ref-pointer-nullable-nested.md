---
"openapi-typesafe": patch
---

A schema `$ref` now gets the type it points at in more places where the old type did not compile: through a nullable schema that is not an object or array (a nullable `allOf` or `anyOf`, a nullable schema without a `type`, `type: [string, "null"]`), through more than eight nested `allOf` items, and through a position of an array (such as `Pet/allOf/0/additionalProperties/items`, where Pet's one `allOf` item has an array of an enum as its `additionalProperties`).
