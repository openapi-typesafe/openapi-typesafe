---
"openapi-typesafe": patch
---

`--enum`: a numbered tuple element enum no longer takes the name of another property's enum. With
a tuple property `sort` of two enums next to an enum property `sort_2`, the tuple's second element
took `HolderSort_2`, so the `sort_2` enum was renamed to `HolderSort_2_2`. `sort_2` now keeps
`HolderSort_2`, and the element gets the next free number. Tuple elements are also numbered by
their position in the tuple: a `$ref` to the second element that the generator met first no
longer swapped the names (`[Tup_2, Tup]`).
