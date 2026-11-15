---
"openapi-typesafe-migrate": patch
---

A Makefile argument written with `:=`, `::=`, `:::=`, `?=`, `!=` or `+=`
(`$(MAKE) -C api GEN:="npx openapi-typescript -it"`) is read as the variable it sets, as
`GEN="…"` already was, so its command is migrated.
