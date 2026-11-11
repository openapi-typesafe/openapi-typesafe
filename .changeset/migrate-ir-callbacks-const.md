---
"openapi-typesafe-migrate": patch
---

A rewritten `transform` in options of a `const` without a type (`const options = { transform }`)
now gets `irCallbacks: true as const` (in JavaScript, `/** @type {const} */ (true)`): a plain
`true` became `boolean` there, and the `openapiTS` call stopped compiling (TS2769). The option is
also written before the JSDoc of `transform`, which stays with `transform`.
