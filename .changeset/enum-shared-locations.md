---
"openapi-typesafe": patch
---

`--enum`: properties of tuple elements, of array `items` and of record values
(`additionalProperties`, `patternProperties`, `unevaluatedProperties`) got one enum per name, so
an enum with other values was merged into the first one and each property accepted the values of
the other. Such an enum now gets a number (`ShapeKind_2`, `SettingsMode_2`); enums with the same
values still share one enum.
