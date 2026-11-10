---
"openapi-typesafe": patch
---

`--enum --dedupe-enums` no longer merges enums with other values. Their key joined the member
names and descriptions as text, and a member name stood in for its value, so `Flag` (`1`, `0`)
became the `Status` enum (`"A"`, `"I"`) when both named their members `Active` and `Inactive`, and
`["1", "2"]` and `[1, 2]`, or `["a", "b"]` and `["a:,b"]`, shared one enum. The key also paired
the values in sorted order with the names in document order, so `[desc, asc]` and `[asc, desc]`,
both named `[Desc, Asc]`, shared one enum and one of them typed `asc` as `Desc = "desc"`. Enums
with the same values and member names are still merged.
