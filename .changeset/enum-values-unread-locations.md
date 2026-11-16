---
"openapi-typesafe": patch
---

`--enum-values` arrays that did not compile are now typed by their own values: an array at a tuple inside a tuple that its values do not fill, at a built-in member of an array (an enum property named `sort` of a `prefixItems` element), under `allOf` items that type a property as an object in one and as an array in another, or read through `Omit` of an intersection with a union. Any array whose place the generator cannot read is typed by its values, so the file compiles. An enum next to an `allOf` item that only has a `description` keeps its pointer type.
