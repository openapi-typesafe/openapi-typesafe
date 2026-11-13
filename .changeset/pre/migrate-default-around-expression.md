---
"openapi-typesafe-migrate": patch
---

A shell default around a GitHub Actions expression (`${GEN:-${{ inputs.gen || 'npx
openapi-typescript' }}} api.yaml`, also with `:+`, `:=` and in `G=${G:-…}`) is migrated: the old
name in it is renamed once, and old flags after it are listed as a manual step. Before, the tool
skipped the whole file with "edits overlap" and exited with `1`. A report whose only findings were
in such a skipped file no longer also says "Nothing to migrate".
