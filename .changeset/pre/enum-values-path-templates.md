---
"openapi-typesafe": patch
---

`--enum-values` with `--path-params-as-types`: the arrays of a path with a `number` or `boolean`
path parameter compile. Their type indexed `FlattenedDeepRequired<paths>["/items/{id}"]`, a key
the type does not have (TS2339); it is now indexed by the path's template
(`` FlattenedDeepRequired<paths>[`/items/${number}`] ``), as a `$ref` into that path already was.
