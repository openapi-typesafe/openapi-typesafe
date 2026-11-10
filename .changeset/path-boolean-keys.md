---
"openapi-typesafe": patch
---

`--path-params-as-types` with only `boolean` path parameters in a path compiles:
`` [path: `/flags/${boolean}`] `` is no valid index signature (TS1337), so such a path is written as
the keys `"/flags/true"` and `"/flags/false"`, with the same path item type (2ⁿ keys for n boolean
parameters). A key that the document already has as a path is left out. Next to another parameter
(`` `/a/${number}/${boolean}` ``) the signature is valid and stays as it was.
