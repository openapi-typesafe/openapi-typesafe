---
"openapi-typesafe": patch
---

With `--enum`, a schema that narrows an enum it inherits through `allOf` (`Cat: allOf: [{ $ref:
Pet }, { properties: { mode: { enum: [a] } } }]`, where `Pet.mode` lists `a`, `b` and `c`) is
typed by the inherited enum's members (`mode?: PetMode.a`). It was `Pet & { mode?: CatMode }`,
two TypeScript enums that intersect to `never`. `CatMode` is still declared. Values that the
inherited enum does not list can never be valid; the type lists the common values and the new
warning `ENUM_VALUES_NOT_INHERITED` names the others.
