---
"openapi-typesafe": patch
---

`--enum-values` output compiles: readonly and nullable parents, arrays declared twice, colliding
names, path item parameters and locations that cannot hold the values (upstream [#2714](https://github.com/openapi-ts/openapi-typescript/issues/2714),
[#2749](https://github.com/openapi-ts/openapi-typescript/issues/2749)).
