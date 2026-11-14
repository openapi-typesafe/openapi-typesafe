---
"openapi-typesafe-migrate": patch
---

A shell variable whose value is written with a backslash or in several quoted parts
(`GEN=npx\ openapi-typescript`, `GEN="npx "openapi-typescript`) now gets the new generator name
too. Before, the flags after `$GEN` were renamed while the value kept `openapi-typescript`, and the
report said nothing about it.
