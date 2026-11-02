---
"openapi-typesafe": patch
---

Always generate names that parse. An `--enum` or `--enum-values` name that starts with a digit
after invalid characters are removed now gets the `Value` prefix (`0 a-b` gave `value0 a-b`).
With `--root-types-keep-casing`, characters that cannot be in an identifier become `_`
(`Schemamy pet` is now `Schemamy_pet`). With `--root-types-no-schema-prefix`, a name that would
start with a digit keeps its prefix (`Schema1`), and two schemas with one PascalCase name, such as
`PetStore` and `pet_store`, both get a root type (`PetStore`, `PetStore_2`) instead of the
second replacing the first. Names that were valid before do not change.
