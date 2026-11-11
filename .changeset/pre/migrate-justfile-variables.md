---
"openapi-typesafe-migrate": patch
---

A justfile variable that holds the generator (`gen := "npx openapi-typescript"`) now has its old
flags renamed where it runs: `{{gen}} api.yaml -it` kept `-it`. A variable of old flags that the
generator gets (`{{flags}}`) is reported.
