---
"openapi-typesafe": patch
---

`--path-params-as-types`: a `boolean` response under a path that a template with a
`true | false` response also matches (`enum: [true, false]`) moved the template into a `paths`
intersection, although TypeScript accepts `boolean` there. The overlap check now reads `boolean`
as `true | false` against a union, and the output is the same as openapi-typescript 7.13 gives.
