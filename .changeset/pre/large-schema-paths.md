---
"openapi-typesafe-fetch": patch
---

Type fixes: schemas with hundreds of paths no longer give TS2589 (upstream [#1882](https://github.com/openapi-ts/openapi-typescript/issues/1882)), and
`createClient<any>()` needs no init argument (upstream [#2526](https://github.com/openapi-ts/openapi-typescript/issues/2526)).
