---
"openapi-typesafe": patch
---

`--enum-values` declares each values array once. A schema typed twice at the same place, such as
two `prefixItems` entries with the same enum, declared the same `export const …Values` twice, and
the file failed with "Cannot redeclare block-scoped variable" (TS2451). Output that compiled
before does not change.
