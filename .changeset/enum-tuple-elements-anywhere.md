---
"openapi-typesafe": patch
---

`--enum`: the elements of a `prefixItems` tuple get their own enums wherever the tuple is. Before,
only a tuple that is a whole component schema got `[Pair, Pair_2]`; a tuple in a property, an
`items`, an `anyOf` / `oneOf` member, a parameter or a response body still declared one enum name
twice (`export enum HolderSort`), which TypeScript merged, so each element accepted the values of
the other. `--dedupe-enums` did the same. Such a tuple now gives `[HolderSort, HolderSort_2]`, and a
`$ref` to one of its elements uses that element's enum.
