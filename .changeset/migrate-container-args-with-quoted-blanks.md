---
"openapi-typesafe-migrate": patch
---

The `args` of a `docker://` step or a Docker action, and a string `command` after an
`entrypoint`, are migrated when a quoted part of them holds a blank
(`-o "${{ github.workspace }}/schema.d.ts"`). Before, the old name and flags in them were left
without a word.
