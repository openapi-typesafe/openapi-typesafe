---
"openapi-typesafe": patch
---

New output fix `allof-discriminated-union` (`--fix allof-discriminated-union`, ADR-021): a schema
that `allOf`s a discriminated `oneOf` or `anyOf` it is not a member of is typed as that union.
Before, it got `Omit<Union, "pet_type">`, which keeps only the keys every member has, and a value
of its own schema name (`{ pet_type: "B" } & …`) that no member allows, so
`B: { pet_type: "B" } & Omit<components["schemas"]["A"], "pet_type">` is now
`B: components["schemas"]["A"]` (openapi-typescript
[#1464](https://github.com/openapi-ts/openapi-typescript/issues/1464),
[#1690](https://github.com/openapi-ts/openapi-typescript/issues/1690)). Without the fix the output
does not change; `--fix all` now includes it.
