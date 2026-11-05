---
"openapi-typesafe": patch
---

The CLI reads a path as a path: a `#`, `?` or `%` in the schema path, in `--output`, `--redocly`,
`--local-ref-root` or in a `redocly.yaml` `root` or `output` is part of the file name. Before, the
path was parsed as a URL, so `specs/#v2/api.yaml` read `specs/` and `a%20b.yaml` read `a b.yaml`.
A one-letter scheme is a Windows drive, so `C:\specs\api.yaml` is a path. URLs (`https:`, `file:`)
work as before.
