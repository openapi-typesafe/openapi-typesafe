---
"openapi-typesafe-migrate": patch
---

Dockerfile `ENV` and `ARG` values are read as Docker reads them: escaped blanks
(`ENV GEN=node_modules/.bin/openapi-typescript\ --redoc\ r.yaml`), several quoted parts
(`ARG G2="npx "openapi-typescript`), escaped quotes, continued lines and the escape character
that `# escape=` sets. The generator command in them is migrated, and the old flags after
`$GEN` are renamed. Before, these values were neither changed nor reported.
