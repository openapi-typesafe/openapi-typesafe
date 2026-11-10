---
"openapi-typesafe": patch
---

`--path-params-as-types`: a `$ref` into a path with a `number` or `boolean` path parameter
compiles. It was typed as `paths["/pets/{id}"]`, which names no key of
`` [path: `/pets/${number}`] `` (TS2339); it is now `` paths[`/pets/${number}`] ``. A boolean path
is indexed by the keys it is written with (`paths["/flags/true" | "/flags/false"]`), without the
one a path of the document takes, so the `$ref` no longer gets that path's type too. With only
string parameters the URL matches the template, so that output stays as it was.
