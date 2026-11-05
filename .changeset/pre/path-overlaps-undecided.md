---
"openapi-typesafe": patch
---

`--path-params-as-types`: output that compiled could still change. A template such as
`` `/a/${string}` `` that also matches `/a/{id}/b` was moved into a `paths` intersection whenever
the overlap check could not read a type of the covered path, such as `Record<string, never>` for
an empty object schema, although TypeScript accepts it. The check now moves a template only where
the covered type surely does not fit; where it cannot tell, the output is the same as
openapi-typescript 7.13 gives, `export interface paths` included.
