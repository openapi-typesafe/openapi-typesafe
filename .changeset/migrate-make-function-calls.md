---
"openapi-typesafe-migrate": patch
---

The generator inside a Makefile `$(strip …)` is renamed, as inside `$(or …)` and `$(if …)`. A call
of any other make function whose arguments name an old package (`$(firstword npx
openapi-typescript)`, `$(call …)`, `$(shell …)`) is listed as a manual step. Before, such a call
kept the old name, and the report could say that nothing was found.
