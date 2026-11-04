---
"openapi-typesafe": patch
---

A discriminated `oneOf` or `anyOf` whose members `allOf` it now compiles (openapi-typescript
[#1665](https://github.com/openapi-ts/openapi-typescript/issues/1665)). Each member was typed as
`Omit<Union, "type"> & …`, and the union contains the member, so TypeScript failed with "is
referenced directly or indirectly in its own type annotation" (TS2502). A member now gets the
union's own properties instead (`{ id?: string } & { age?: number } & { type: "CAT" }`), or none
when the union has only the discriminator property. On by default: only output that did not
compile changes.
