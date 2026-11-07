---
"openapi-typesafe-migrate": patch
---

The tool no longer reads or writes a file outside the folder it migrates. A planted git index can
list paths such as `../../outside/a.ts`, and `--write` changed those files. Every listed path must
now resolve, with links resolved, inside the project folder; the others are skipped, and the report
lists them under "Skipped".
