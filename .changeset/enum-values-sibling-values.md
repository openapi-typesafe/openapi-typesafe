---
"openapi-typesafe": patch
---

`--enum-values` arrays of a `prefixItems` element or of an `anyOf` / `oneOf` member are typed by
their own values where the place of their schema also admits the values of the other elements or
members. Before, `prefixItems: [{ enum: [asc, desc] }, { enum: [name, date] }]` typed both arrays by
the whole tuple, so `"date"` was accepted as an item of the first one, and with
`--fix=prefix-items` an open tuple accepted any value. The same holds for `oneOf` members that
narrow a property their parent also lists (`status: [queued, done]` next to members with `[done]`
and `[queued]`), also next to an object property without properties. Arrays whose place admits
exactly their values keep their type.
