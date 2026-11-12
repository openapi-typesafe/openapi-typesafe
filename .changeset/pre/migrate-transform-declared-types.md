---
"openapi-typesafe-migrate": patch
---

A rewritten `transform` whose type is declared outside the function now compiles: a TypeScript
node type in the type of its `const` (`const transform: (s: SchemaObject) => ts.TypeNode`), in a
JSDoc `@type` or in a JSDoc `@returns` becomes `string`, like the returns. Before, that type stayed
and the file no longer compiled. A declared type the tool cannot map, such as a local alias, keeps
the `transform`, which is listed as a manual step.
