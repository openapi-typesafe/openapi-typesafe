---
"openapi-typesafe": patch
---

The fix names are exported as the `OutputFix` union, the `OUTPUT_FIXES` list and `OutputFixName`
(a fix name or `"all"`), as ADR-021 describes. The `OutputFix` object (`OutputFix.ALLOF_REQUIRED`)
and the `ALL_OUTPUT_FIXES` constant, which only rc versions had, are removed: write the fix names
as strings, for example `fix: ["allof-required"]` or `fix: ["all"]`.
