---
"openapi-typesafe-migrate": patch
---

A command line passed to a program as a variable is migrated:
`cross-env GEN="npx openapi-typescript -it" node gen.js`, `env GEN="…" make` and
`$(MAKE) -C api GEN="…"` get the new generator name and flags. A one-word value that names an
old package (`make GEN=openapi-typescript`) is reported. Before, both were left without a word.
