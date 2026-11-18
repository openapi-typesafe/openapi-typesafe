---
"openapi-typesafe": patch
---

`--fix discriminator-values`: a member that declares its discriminator value without requiring the
property (`kind: { const: cat }` and no `required`) gets no second property any more; the declared
property becomes required instead (`{ kind: "cat" }`). With `--enum` every declaration of the value
is typed by the owner's enum member (`PetKind.cat`), so two declarations no longer intersect to
`never`. The member's own enum is still declared.
