---
"openapi-typesafe": patch
---

`--enum --dedupe-enums` no longer splits the enum of a schema property in two. A property and an
inline `allOf` item with other values (`mode: [a]` next to `allOf: [{ mode: [a, b] }]`) share
one enum, `TMode`, but when another schema listed the values of only one of them (`U: { mode:
[a] }`), that one shared `U`'s enum and the type became `{ mode?: TMode_2 } & { mode?: TMode }`,
which is `never` (also with `--fix dedupe-enum-names` and `--fix all`, and for a discriminated
union and its members). `--dedupe-enums` now shares an enum only between schemas whose whole
enums have the same members, so `T` gets `TMode.a & TMode` and `U` its own `UMode`.
