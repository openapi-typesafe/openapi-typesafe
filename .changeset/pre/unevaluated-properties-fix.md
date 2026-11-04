---
"openapi-typesafe": minor
---

Add the `unevaluated-properties` output fix (`--fix unevaluated-properties`, ADR-021). Without it
`unevaluatedProperties` is ignored, so an object with only that keyword is `Record<string, never>`.
With it the keys that no other keyword declares get its type through an index signature, which
also holds the declared property types of the schema and its `allOf`, `anyOf` and `oneOf` members
(`PropertyValues<T>` for a `$ref`), so valid values stay assignable (openapi-typescript #2839,
#2880). Without the fix the output is unchanged.
