---
"openapi-typesafe": patch
---

`--enum-values` arrays whose type, the location of their schema in the generated types, cannot
hold their values are typed by their own values (`ReadonlyArray<"a" | "b">`), so the output
compiles: a schema under `definitions` or an `allOf` member, a property of a schema whose type is
`unknown`, an `anyOf` array member next to a non-array one, an empty enum (`readonly never[]`), or
a schema that contradicts itself (an `allOf` of different enums, a discriminator value its enum
does not list). The last case also prints a warning (`ENUM_VALUES_EXCLUDED`). Arrays whose type
compiled stay the same (ADR-027).
