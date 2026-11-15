---
"openapi-typesafe": patch
---

`--dedupe-enums --fix dedupe-enum-names`: a schema typed only for a `$ref` into it (such as a
`definitions` entry) no longer names a shared enum, so adding or removing such a `$ref` does not
rename the enum.
