---
"openapi-typesafe": patch
---

New output fix `discriminator-enum-members` (`--fix discriminator-enum-members`, ADR-021), for
`--enum`: when the discriminator owner's property is an enum (`petType: { $ref: PetType }`), the
property the scan adds to each member uses that enum's member, `petType: PetType.Cat`. Before,
each member declared an enum of its own (`CatPetType`) that is not assignable to `PetType`, so a
`Cat` could not be used as a `Pet` (openapi-typescript
[#1700](https://github.com/openapi-ts/openapi-typescript/issues/1700)). A member without a mapping,
whose value is its schema name, gets the enum member too. An inline enum of the owner and one
inherited through `allOf` work too; a value that the owner's enum lacks keeps the old
output. Without `--enum` the fix changes nothing, and naming it prints a notice. Without the fix
the output does not change; `--fix all` now includes it.
