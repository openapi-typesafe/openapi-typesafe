---
"openapi-typesafe": patch
---

With `--enum --dedupe-enums`, a schema that narrows an enum it inherits through `allOf` no
longer renames the enum that the inherited property shares with other schemas. When such a
schema came first (`Cat: allOf: [$ref: Pet, { mode: [a] }]` before `Kind: [a, b]` and
`Pet.mode: [a, b]`), the shared enum was named `PetMode` instead of `Kind`, so the export
`Kind` was missing. It is named after the first schema that lists its values again, as without
the narrowing.
