---
"openapi-typesafe": patch
---

Inline `postTransform` and `transformProperty` callbacks in `openapiTS(source, { … })` without
`irCallbacks` get their parameter types again (`ts.TypeNode`, `ts.PropertySignature`) instead of
an implicit `any` that `strict` rejects (TS7006), as with openapi-typescript 7.
