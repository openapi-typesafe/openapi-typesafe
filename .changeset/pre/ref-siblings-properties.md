---
"openapi-typesafe": patch
---

`--fix ref-siblings` also reads the keywords next to the `$ref` of an object property
(`owner: { $ref: Base, required: [id] }` is `WithRequired<Base, "id">`); it read them only for
components, array items, bodies and parameters.
