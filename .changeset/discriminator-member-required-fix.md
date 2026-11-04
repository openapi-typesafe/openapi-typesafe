---
"openapi-typesafe": patch
---

New output fix `discriminator-member-required` (`--fix discriminator-member-required`, ADR-021):
`required` next to an `allOf` `$ref` keeps `WithRequired` when the target is also a member of a
discriminated `oneOf`. Before, a discriminator elsewhere in the document dropped it, so
`Cat: WithRequired<components["schemas"]["CatProps"], "kittens">` became
`Cat: components["schemas"]["CatProps"]` and `kittens` stayed optional (openapi-typescript
[#2162](https://github.com/openapi-ts/openapi-typescript/issues/2162)). The discriminator property
itself is required in the target already and is not repeated. Without the fix the output does not
change; `--fix all` now includes it.
