---
"openapi-typesafe": patch
---

`--enum`: a numbered enum name no longer takes the name of a component schema. With a tuple
`Pair` of two enums and a separate enum schema `Pair_2`, the tuple's second element took `Pair_2`,
so the schema's enum was declared as `Pair_2_2`. The schema now keeps `Pair_2`, and the element
gets `Pair_3`.
