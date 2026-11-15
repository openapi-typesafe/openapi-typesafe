---
"openapi-typesafe": patch
---

`--enum` and `--enum-values`: the enums of a tuple nested in a tuple, or of tuples in one `allOf`,
are numbered in the order of the document. A `$ref` to one of their elements decided the numbers.
