---
"openapi-typesafe": minor
---

New `irCallbacks: true` option: `transform`, `postTransform` and `transformProperty` take and
return IR or type text. Deprecated, removed in 2.0: the `ts.Node` forms of these callbacks,
`stringToAST()`, `resolveRef`, `scanDiscriminators`, `walk`, `c`, `debug`, `warn`, `error` and the
TypeScript-node helpers listed in the Node API docs.
