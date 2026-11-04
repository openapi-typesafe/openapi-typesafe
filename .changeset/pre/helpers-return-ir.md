---
"openapi-typesafe": minor
---

**Breaking compared with `openapi-typescript`:** the type helpers (`tsUnion`, `tsIntersection`, `tsNullable`, `tsOmit`, `tsRecord`, `tsLiteral`, `tsWithRequired`, `oapiRef`), the type constants (`STRING`, `NUMBER`, `BOOLEAN`, `NULL`, `UNKNOWN`, `NEVER`, `TRUE`, `FALSE`, `UNDEFINED`) and the exported transformers (`transformSchemaObject`, `transformComponentsObject`, `transformPathsObject` and the others) return IR objects instead of TypeScript compiler nodes. The helpers still accept TypeScript type nodes as input, and `astToString` prints IR, TypeScript nodes or a mix of both. `ctx.injectFooter` holds IR declarations; TypeScript nodes pushed by user callbacks still work. A `transform` or `transformProperty` callback may return IR or TypeScript nodes. Code that passes the constants or helper results into `ts.factory` calls must convert them first or build the whole type with the helpers (see ADR-004).
