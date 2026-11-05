---
"openapi-typesafe": patch
---

`--path-params-as-types`: nested paths such as `/cases/{id}` and `/cases/{id}/summary`, whose
operations differ only in a referenced response schema, gave output that did not compile (TS2413,
openapi-typescript #1752). The overlap check now reads the `operations` and `components` types the
paths reference, so such a template gets its own object in the `paths` intersection. Output that
compiled stays byte-identical. This fix is on by default.
