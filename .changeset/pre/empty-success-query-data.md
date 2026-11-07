---
"openapi-typesafe-react-query": patch
---

Every successful response without a body gives `data: null`, and the types say so (upstream
[#2234](https://github.com/openapi-ts/openapi-typescript/issues/2234), [#2464](https://github.com/openapi-ts/openapi-typescript/issues/2464)).
