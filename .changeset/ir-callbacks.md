---
"openapi-typesafe": minor
---

Add the `irCallbacks: true` option (`OpenAPITSIrOptions`). With it, `transform`, `postTransform` and `transformProperty` receive and return IR nodes; a type result may also be TypeScript type text, printed as written. The TypeScript-node forms of `postTransform` and `transformProperty` are deprecated (ADR-004).
