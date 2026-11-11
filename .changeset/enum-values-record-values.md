---
"openapi-typesafe": patch
---

`--enum-values`: the array of an `additionalProperties` enum next to `properties` or
`patternProperties` is typed by its own values (`ReadonlyArray<"x" | "y">`). It was typed as
`FlattenedDeepRequired<components>["schemas"]["Stats"][string]`, which reads the whole index
signature, the property and pattern types included, so `5` was accepted as an item of an enum of
strings.
