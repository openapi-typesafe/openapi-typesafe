---
"openapi-typesafe": patch
---

`--root-types-no-schema-prefix` with schemas of one PascalCase name (`Void` and `void`) gives the
same output as openapi-typescript again: the last schema gets `Void` and the earlier ones have no
root alias. `1.0.0-beta.2` also added numbered aliases (`Void_2`), which changed valid output;
that is now a backlog item for an opt-in flag.
