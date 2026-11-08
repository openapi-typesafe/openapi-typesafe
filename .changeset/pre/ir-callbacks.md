---
"openapi-typesafe": minor
---

New `irCallbacks: true` option: `transform`, `postTransform` and `transformProperty` take and
return IR or type text instead of TypeScript nodes.

Deprecated, removed in 2.0: the `ts.Node` forms of these callbacks, `stringToAST()`, `resolveRef`,
`scanDiscriminators`, `walk`, `c`, `debug`, `warn`, `error` and the TypeScript-node helpers listed
in the Node API docs. They still work in 1.x and are marked `@deprecated` in the types. The
`ts.Node` callbacks and `stringToAST()` also emit a Node.js `DeprecationWarning`, once per process,
with an `OPENAPI_TYPESAFE_DEP_*` code (listed in the new `DEPRECATION_CODES` export):
`node --no-deprecation` hides it, `--throw-deprecation` makes it an error, `silent` does not hide
it. `resolveRef` now takes the document as `unknown` and returns the node at a `$ref` that is not a
string, where it used to throw.
