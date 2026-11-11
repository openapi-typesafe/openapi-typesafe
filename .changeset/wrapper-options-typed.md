---
"openapi-typesafe": patch
---

A wrapper whose options are typed `Parameters<typeof openapiTS>[1]` gives its inline
`postTransform` and `transformProperty` callbacks their parameter types again, as with
openapi-typescript 7, instead of an implicit `any` that `strict` rejects (TS7006).
