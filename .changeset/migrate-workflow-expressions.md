---
"openapi-typesafe-migrate": patch
---

The migration renames the old generator in GitHub Actions expressions again, such as
`run: ${{ inputs.generator || 'npx openapi-typescript' }} api.yaml` and
`npx ${{ inputs.pkg || 'openapi-typescript' }}`, and in input defaults of an `action.yml` or a
reusable workflow (`default: npx openapi-typescript`). The value of an expression comes from the
run, so old flags after it are listed as a manual step. Before, these places were neither changed
nor reported, and npx ran the old package after the migration.
