---
"openapi-typesafe-migrate": patch
---

An import that a JSDoc comment still names (`@param {ts.TypeNode} node`, `{@link ts.factory}`) is
no longer removed with the rewritten `transform` returns. In a checked JavaScript file the type
stopped resolving (TS2503).
