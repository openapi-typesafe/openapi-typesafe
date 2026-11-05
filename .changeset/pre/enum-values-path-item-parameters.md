---
"openapi-typesafe": patch
---

`--enum-values`: the values array of an enum in a path item parameter (`paths`, `webhooks`,
`components.pathItems`) was typed as `paths["/a"]["parameters"]["parameters"]["path"]["id"]`, which
does not exist, and the output did not compile (TS2339). It now indexes `parameters` once. The
array names and output that compiled stay the same.
