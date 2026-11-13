---
"openapi-typesafe-migrate": patch
---

The old generator inside a make function is renamed: `$(or $(GEN),npx openapi-typescript)`,
`$(if $(GEN),$(GEN),npx openapi-typescript)` and `$(and …)`, in a recipe line or in a variable's
value. The function may give another program, so old flags after it are still listed as a manual
step. Before, the old name stayed, and with no flags after it the report said "Nothing to migrate".
