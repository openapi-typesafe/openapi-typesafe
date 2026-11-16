---
"openapi-typesafe": patch
---

A schema `$ref` whose type compiled but had no value (`never`) now gets the type it points at. This happens where the owner of the target can have no value, such as an object whose `allOf` makes it `null`. A `$ref` to a `false` schema keeps its type.
