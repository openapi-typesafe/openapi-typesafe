---
"openapi-typesafe": patch
---

`--path-params-as-types`: a path whose response is an item of another path's array response
(`$ref: "#/paths/~1a/get/responses/200/content/application~1json/schema/items"`, written as
`...["application/json"][number]`) stayed in the `paths` interface under a template that covers
it, and the output did not compile (TS2413). The overlap check now reads `T[number]` of an array
as its element, so it sees that an item is no array and moves the template, as rc.0 did.
