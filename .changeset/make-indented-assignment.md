---
"openapi-typesafe-migrate": patch
---

A Makefile assignment indented with spaces, or with a tab before the first rule, is now read as an
assignment, as make reads it. A command set there gets the new package name, and its old flags
are migrated or reported where the variable runs.
