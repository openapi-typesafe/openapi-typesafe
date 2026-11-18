---
"openapi-typesafe": patch
---

`--enum`: an enum that narrows an inherited enum is now typed by the base's members in more
documents. The base's enum is found inside a one-item `allOf` (the usual way to add a
`description` to a `$ref`), inside `oneOf` / `anyOf` variants such as `[$ref, null]`, in the
base's own `allOf` items, and through `allOf` chains (`Kitten` of `Cat` of `Pet` gets
`PetMode.a`). Before, these places kept an enum of their own, which made the type `never`.
