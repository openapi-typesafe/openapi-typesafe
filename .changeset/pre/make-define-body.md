---
"openapi-typesafe-migrate": patch
---

A Makefile `define` block is now read as the value of its variable. A command written in the body
of `define GEN … endef` gets the new package name and its old flags are migrated where `$(GEN)`
runs, and lines of the body are no longer read as rules or recipes of the Makefile.
