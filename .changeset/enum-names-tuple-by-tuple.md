---
"openapi-typesafe": patch
---

`--enum` and `--enum-values`: when two tuples ask for the same enum name (a tuple property `sort`
of `Order` and a tuple schema `OrderSort`, or `Tup` and `tup`), the elements are numbered tuple by
tuple, in the order of the document: `OrderSort`, `OrderSort_2` for the first tuple, then
`OrderSort_3`, `OrderSort_4`. Before, the elements of both tuples were numbered together by
position, and a `$ref` to an element anywhere in the document could swap two names. With
`--dedupe-enums --fix dedupe-enum-names`, an enum that two tuples share is numbered at its
position in the tuple whose name it takes, so the order of the tuples in the document no longer
changes the names.
