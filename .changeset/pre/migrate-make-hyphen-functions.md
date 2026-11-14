---
"openapi-typesafe-migrate": patch
---

A Makefile call of a function with a hyphen in its name, such as
`$(filter-out x,npx openapi-typescript)`, is reported when its arguments name an old package.
Before, the file was neither changed nor reported ("Nothing to migrate").
