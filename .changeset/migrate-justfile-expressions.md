---
"openapi-typesafe-migrate": patch
---

A justfile variable set by an expression (`gen := env_var_or_default("GEN", "npx
openapi-typescript")`, an `if … { … } else { … }`), a recipe parameter default
(`types gen="npx openapi-typescript":`) and a string in an interpolation get the new generator
name again; they kept the old one without a word, and `npx` then downloaded the old generator.
Such a value can also be another program, so the old flags after `{{gen}}` are reported.
