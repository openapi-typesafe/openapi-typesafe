---
"openapi-typesafe": patch
---

New output fix `discriminator-declared-value` (`--fix discriminator-declared-value`, ADR-021): a
discriminator member that already requires the discriminator property with exactly the value its
mapping gives (`enum: [agent]` or `const: agent`) is left as it is. Before, the scan added the
property a second time, `{ type: "agent" } & { type: "agent" }`, which linters report as a
duplicate constituent (openapi-typescript
[#2124](https://github.com/openapi-ts/openapi-typescript/issues/2124)); a member that both a
`mapping` and an `allOf` of its parent name got it twice as well, and an object schema's own
property lost its description. Without the fix the output does not change; `--fix all` now
includes it.
