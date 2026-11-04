---
"openapi-typesafe": patch
---

Fix `$defs` types. A schema's `$defs` member is now optional (`$defs?: { … }`), so values no
longer need a `$defs` key, and refs into it use `NonNullable<…>` (upstream #2664). The root
`$defs` now has one member per subschema instead of `Record<string, never>`, so `#/$defs/<name>`
refs resolve to the subschema type instead of `never`.
