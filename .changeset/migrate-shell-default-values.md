---
"openapi-typesafe-migrate": patch
---

The migration now renames the old generator inside a shell default value, such as
`${GEN:-npx openapi-typescript}`, `: "${GEN:=npx openapi-typescript}"` or
`npx ${PKG:-openapi-typescript}`. Before, these commands kept the old name and npx quietly ran the
old package. The variable can still be set to another program outside the file, so the flags after
such a default are listed as a manual step instead of being changed.
