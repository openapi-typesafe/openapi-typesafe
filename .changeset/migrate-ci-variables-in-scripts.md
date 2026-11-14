---
"openapi-typesafe-migrate": patch
---

When a CI file sets a variable to the generator (GitLab `variables`, Compose `environment`,
CircleCI `environment`, Task `vars`, Azure `variables`, a workflow `env`), the migration now also
reads the scripts and other command files that expand it (`$GEN api.yaml -it` in
`scripts/gen.sh`), even when they name no old package, and reports the old flags after `$GEN`
there. Before, the variable was renamed and those flags were kept without a word.
