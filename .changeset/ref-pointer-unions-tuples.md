---
"openapi-typesafe": patch
---

A schema `$ref` now gets the type it points at in three more places where the old type did not compile or was not the target's: into a variant of an `anyOf` / `oneOf` whose variants are records (`additionalProperties`), into the `items` of a `prefixItems` tuple (its rest items, which `[number]` mixed with the tuple's elements), and through the `$defs` of an empty `enum`.
