---
"openapi-typesafe": patch
---

`--path-params-as-types`: a `$ref` into a path with a `number` or `boolean` path parameter
compiles. It was typed as `paths["/pets/{id}"]`, which names no key of
`` [path: `/pets/${number}`] `` (TS2339); it is now `` paths[`/pets/${number}`] ``. With only
string parameters the URL matches the template, so that output stays as it was.
