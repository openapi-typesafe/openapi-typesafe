---
"openapi-typesafe": patch
---

`--enum`: the elements of a `prefixItems` tuple no longer share one enum name. Before,
`prefixItems: [{ enum: [asc, desc] }, { enum: [name, date] }]` declared `export enum Pair` twice,
which TypeScript merged into one enum, so each element accepted the values of the other. An element
whose values differ from an earlier one's now gets a number (`[Pair, Pair_2]`); elements with the
same values still share one enum.
