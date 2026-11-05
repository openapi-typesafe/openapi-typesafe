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
  A discriminator of another property that the owner inherits still gives its members a value:
  `Video` of `Content` (which owns `subtype`) of `Element` (which owns `contentType`) gets both.
  Its value of the other property is its own (`contentType: "Video"` when no mapping names it),
  also when `Element`'s mapping names `Content`: `Content`'s `"content"` is left out of `Video`.
- A member that already requires the property with exactly its values (`enum: [agent]` or
  `const: agent`) gets no second, added property: `{ type: "agent" }`, not
  `{ type: "agent" } & { type: "agent" }`
  ([#2124](https://github.com/openapi-ts/openapi-typescript/issues/2124)).
- With `--enum`, when the owner's property is an enum (`petType: { $ref: PetType }`), a member's
  value is a member of that enum, `petType: PetType.Cat`, with or without a mapping. Before, each
  member declared an enum of its own (`CatPetType`) or got the string `"Cat"`, and neither is
  assignable to `PetType`, so a `Cat` was not a `Pet`
  ([#1700](https://github.com/openapi-ts/openapi-typescript/issues/1700)). A value from a
  discriminator that declares no such property (a `oneOf` with a `mapping`) is a member of the
  enum the member inherits. With `--dedupe-enums`, a shared enum keeps the name it has without
  the fix (`OtherK`, not the owner's `PetPetType`).

Without the fix the output does not change; `--fix all` includes it.
