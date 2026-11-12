---
"openapi-typesafe-migrate": patch
---

A Makefile command that make computes, such as `$(or $(GEN),npx openapi-typescript) b.yaml -it`,
is now reported with the text you wrote. Before, the report showed a row of underscores instead.
