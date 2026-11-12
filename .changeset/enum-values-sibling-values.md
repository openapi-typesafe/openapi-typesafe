---
"openapi-typesafe": patch
---

`--enum-values` arrays of a `prefixItems` element or of an `anyOf` / `oneOf` member are typed by
their own values where the place of their schema also admits the values of the other elements or
members. Before, `prefixItems: [{ enum: [asc, desc] }, { enum: [name, date] }]` typed both arrays by
the whole tuple, so `"date"` was accepted as an item of the first one, and with
`--fix=prefix-items` an open tuple accepted any value. Arrays whose place admits exactly their
values keep their type.
