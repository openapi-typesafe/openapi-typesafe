---
"openapi-typesafe": patch
---

`--path-params-as-types` with a `boolean` path parameter compiles: `` [path: `/flags/${boolean}`] ``
is no valid index signature (TS1337), so each boolean parameter is written as the keys
`"/flags/true"` and `"/flags/false"`, with the same path item type (2ⁿ keys for n boolean
parameters). A key that the document already has as a path is left out.
