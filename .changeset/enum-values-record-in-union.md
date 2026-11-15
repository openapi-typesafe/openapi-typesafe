---
"openapi-typesafe": patch
---

`--enum-values`: the array of an `additionalProperties` enum in an `anyOf` / `oneOf` variant next
to a variant that is not a record (a `string`, an object without `additionalProperties`) is typed
by its own values. Its `[string]` type did not compile.
