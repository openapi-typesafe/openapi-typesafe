---
"openapi-typesafe-migrate": patch
---

A Makefile variable is now read as the value its lines build, in the order make reads them.
`GEN := npx` followed by `GEN += openapi-typescript` is one command, so the old package name is
renamed and the old flags after `$(GEN)` are migrated. A later plain assignment replaces an
earlier value, `override` protects a value as it does in make, and values set for some targets
apply in their recipes and in the prerequisites make builds for them. Only the branches of an
`ifeq`/`ifdef` block, `?=` and values make computes are read as several possible values.
