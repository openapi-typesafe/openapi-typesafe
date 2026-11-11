---
"openapi-typesafe-migrate": patch
---

A shell variable that holds the generator is migrated now. A script, a CI `run` block or a
`package.json` script that sets `GEN="npx openapi-typescript"` (also after `export`, `local` or
`readonly`) and then runs `$GEN api.yaml -it` was left as it was, and nothing was reported, so
the build went on downloading the old generator. The value is renamed where it is set and the
flags after `$GEN` where it runs, and a variable of old flags that the generator gets is reported.
