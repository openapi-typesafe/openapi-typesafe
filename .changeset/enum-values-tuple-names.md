---
"openapi-typesafe": patch
---

`--enum-values`: the arrays of a tuple's elements are numbered by position (`pairValues` for the
first element, `pairValues_2` for the second), also when a `$ref` to a later element comes first in
the document; before, that `$ref` swapped the two names.
