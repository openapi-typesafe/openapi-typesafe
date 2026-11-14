---
"openapi-typesafe-migrate": patch
---

A generator command appended to a variable that the file does not set before
(`H+="npx openapi-typescript -it"` in a shell script, `GEN += npx openapi-typescript` in a
Makefile) is migrated where it is written. Before, it was only reported. The flags after a later
`$H` are still reported, since the value from outside may start with another program.
