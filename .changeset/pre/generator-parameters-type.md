---
"openapi-typesafe": patch
---

`Parameters<typeof openapiTS>` and `ReturnType<typeof openapiTS>` are again those of
openapi-typescript 7: `[source, options?: OpenAPITSOptions]` and a promise of the declarations. A
wrapper typed `(...args: Parameters<typeof openapiTS>)` takes the source alone and `undefined`
options again. A wrapper that takes `irCallbacks: true` types its options as `GeneratorOptions`.
