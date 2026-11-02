---
"openapi-typesafe": patch
---

`--root-types-no-schema-prefix` with schemas of one PascalCase name (`Void` and `void`): the
shared alias `Void` again means the later schema, as in openapi-typescript, and each earlier
schema gets a numbered alias (`Void_2`). Before this fix, `Void` had moved to the earlier schema.
