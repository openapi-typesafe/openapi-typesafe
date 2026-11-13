---
"openapi-typesafe-migrate": patch
---

Old flags appended to a variable that holds the generator are renamed: a Makefile `GEN += -it`,
a shell `G+=" -it"` and a justfile `"npx openapi-typescript" + " -it"`. A Makefile value that `+=`
starts after an empty one (`CMD =`, then `CMD += npx openapi-typescript`) runs the generator, so
the flags after `$(CMD)` are renamed too. Where the variable may also run another program, the
appended flags are listed as a manual step. Before, they were kept without a word, and the
migrated command failed with an unknown flag.
