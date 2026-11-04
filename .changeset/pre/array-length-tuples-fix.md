---
"openapi-typesafe": minor
---

New output fix `array-length-tuples` (`--fix array-length-tuples`, ADR-021), for `--array-length`:
`minItems: 1, maxItems: 2` gives `[string] | [string, string]` instead of `[] | [string]`; a nested
array is no longer wrapped twice (`[string[]]`, not `[string[][]]`); with `--immutable` the length
tuples are `readonly`; and a `prefixItems` tuple is not wrapped in length tuples
(openapi-typescript #2048, #2330, #2546). Without `--array-length` the fix changes nothing, and
naming it prints a notice. Without the fix the output does not change.
