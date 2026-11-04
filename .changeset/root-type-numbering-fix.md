---
"openapi-typesafe": minor
---

Add the `root-type-numbering` output fix (`--fix root-type-numbering`, ADR-021). With `--root-types
--root-types-no-schema-prefix`, schemas of one PascalCase name (`PetStore`, `pet_store`) each get
a root alias: the later keeps the name, as before, and the earlier get the next free number
(`PetStore_2`), instead of no alias. It needs both flags and prints a notice without them. Without
the fix the output is unchanged.
