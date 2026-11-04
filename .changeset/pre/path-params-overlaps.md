---
"openapi-typesafe": patch
---

`--path-params-as-types`: when a template key such as `` `/apps/${string}` `` also matches another
path (`/apps/regions`, `` `/apps/${string}/restart` ``) whose type does not fit the template's (a
method or a parameter location one has and the other has not), the output did not compile
(TS2411, TS2413). `paths` is then an intersection type alias with each such template in an object
of its own, which removes those errors, and every path keeps the type it had. Output that
compiled stays the same, `export interface paths` included.
