---
"openapi-typesafe-migrate": patch
---

Text that a Makefile passes to `$(eval …)` is now read as Makefile lines. A command in it gets
the new package name instead of being reported, and values it sets for a variable make the tool
report the old flags of that variable's commands.
