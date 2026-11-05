---
"openapi-typesafe": patch
---

`--binary-as-blob` with `--root-types --root-types-no-schema-prefix`: a schema named `Blob` got
the alias `Blob`, which hid the global type, so every binary body and response silently had the
type of that schema. Its alias is now `Blob_2`, as a schema named `Record` already gets
`Record_2`.
