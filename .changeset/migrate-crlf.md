---
"openapi-typesafe-migrate": patch
---

A `pnpm-workspace.yaml` with CRLF line endings is migrated now; before, its catalog entries were
not found and the tool said there was nothing to migrate. Each line keeps its own ending. A
`package.json` with CRLF line endings keeps them when it is written again; it used to get LF.
