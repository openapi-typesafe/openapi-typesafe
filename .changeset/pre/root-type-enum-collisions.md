---
"openapi-typesafe": patch
---

`--enum` with `--root-types`: a root type alias no longer gets the same name as an enum. Before,
both were exported under one name and the output did not compile. The alias now gets the next free
suffix (`ClusterState_2`); the enum keeps its name. Fixes upstream #2099, #2341, #2206.
