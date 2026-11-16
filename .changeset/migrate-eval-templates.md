---
"openapi-typesafe-migrate": patch
---

In a Makefile template run by `$(eval $(call TPL,a))`, `$$(GEN) $(1).yaml -it` is read as make
reads it, as `$(GEN)`: the flags are renamed when `GEN` runs the generator. Before, the report
named `$(1).yaml` as the program and asked to rename the flags by hand. The report of text that
several containers share now says it may come from a YAML anchor or a Compose `extends`.
