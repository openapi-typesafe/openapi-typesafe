---
"openapi-typesafe-migrate": patch
---

In a Makefile template that `$(eval …)` reads, a run of `$` is read as make reads it, two at a
time from the left: `$$$$GEN` in a template is the recipe's `$$GEN`, so the old flags after it
are listed to fix by hand, as they are in a recipe outside a template. Before, they were left
unchanged and not listed.
