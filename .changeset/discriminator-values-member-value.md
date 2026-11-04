---
"openapi-typesafe": patch
---

The output fix `discriminator-values` (`--fix discriminator-values`, ADR-021, ADR-024) now
corrects every case of the value a discriminator member gets. Projects that list it in rc.0 get
new output:

- A schema that defines a discriminator with a `mapping` and also `allOf`s another discriminator
  owner keeps its own discriminator. Before, the inherited one replaced it, so the schemas listed
  after the owner got their schema name instead of the mapped value (`contentType:
  "JDocumentContentModel"` instead of `"jDocument"`), and the output depended on the order of the
  schemas (openapi-typescript [#2200](https://github.com/openapi-ts/openapi-typescript/issues/2200)).
- A member that already requires the property with exactly its values (`enum: [agent]` or
  `const: agent`) gets no second, added property: `{ type: "agent" }`, not
  `{ type: "agent" } & { type: "agent" }`
  ([#2124](https://github.com/openapi-ts/openapi-typescript/issues/2124)).
- With `--enum`, when the owner's property is an enum (`petType: { $ref: PetType }`), a member's
  value is a member of that enum, `petType: PetType.Cat`, with or without a mapping. Before, each
  member declared an enum of its own (`CatPetType`) or got the string `"Cat"`, and neither is
  assignable to `PetType`, so a `Cat` was not a `Pet`
  ([#1700](https://github.com/openapi-ts/openapi-typescript/issues/1700)).

Without the fix the output does not change; `--fix all` includes it.
