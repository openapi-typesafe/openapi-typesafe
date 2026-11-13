---
"openapi-typesafe-migrate": patch
---

Old flags in the default of an action or workflow input (`inputs.flags.default: --immutable-types`)
are listed as a manual step where a command gets them as `${{ inputs.flags }}`, as for an `env`
value used as `$FLAGS`. Before, they were not reported, and the migrated step failed.
