---
"openapi-typesafe": patch
---

`--enum --dedupe-enums`: the enums of a tuple whose elements repeat values (`[a], [b], [a]`) are
named by position again (`[Tup, Tup_2, Tup]`) when a `$ref` to a later element comes first in the
document; before, the names swapped and `Tup` held the second element's values.
