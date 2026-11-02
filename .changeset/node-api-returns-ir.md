---
"openapi-typesafe": minor
---

**Breaking compared with `openapi-typescript`:** `openapiTS()` returns the generated declarations as IR objects (`IrDeclaration[]`) instead of TypeScript compiler nodes. `astToString(await openapiTS(…))` works unchanged and prints them with the package's own printer, byte for byte as before. Code that inspected or edited the returned `ts.Node`s must work with the IR objects instead (see ADR-004).
