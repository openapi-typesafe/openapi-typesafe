---
"openapi-typesafe": patch
---

`--enum`: a value that an `allOf` meets in two forms no longer makes the type `never`. A `const`,
or an enum kept as a union of literals, that narrows an inherited enum gets that enum's members
(`mode: { const: a }` of `Pet.mode: [a, b]` is `PetMode.a`), and an enum that narrows inherited
literals gets those literals. The same holds for a literal next to an enum in another part of the
same `allOf`, such as a member's own discriminator value next to the property the generator adds
(`{ kind?: CatKind } & { kind: CatKind }`).
