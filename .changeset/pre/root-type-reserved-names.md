---
"openapi-typesafe": patch
---

`--root-types --root-types-no-schema-prefix --root-types-keep-casing`: a schema whose name
TypeScript reserves (`void`, `class`, `string`, …) keeps the prefix (`Schemavoid`), as a name that
starts with a digit already does. Before, `export type void` did not compile.
