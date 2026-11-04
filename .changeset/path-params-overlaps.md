---
"openapi-typesafe": patch
---

`--path-params-as-types`: when a template key such as `` `/apps/${string}` `` also matches another
path (`/apps/regions`, `` `/apps/${string}/restart` ``), the output did not compile (TS2411,
TS2413). `paths` is then an intersection type alias with each such template in an object of its
own, so it compiles, and every path keeps the type it had. Schemas without such paths keep
`export interface paths`.
