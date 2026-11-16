---
"openapi-typesafe-migrate": patch
---

A Makefile target or target-specific value whose name holds a variable (`$(TARGET): GEN = …`)
may apply to any target, so the tool now reads it as one of the possible values of every recipe and
reports the flags it cannot be sure of, instead of reading the recipe with the value of the file.
