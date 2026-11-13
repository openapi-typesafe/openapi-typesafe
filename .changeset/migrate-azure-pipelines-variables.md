---
"openapi-typesafe-migrate": patch
---

The generator set in Azure Pipelines `variables` is migrated, as in a workflow `env`: a map, or a
list of `- name: … / value: …` items, in `azure-pipelines.yml`, `*.azure-pipelines.yml`,
`azure-pipelines-*.yml` and the files of `.azure-pipelines/` and `.azuredevops/`. A script that
runs it as `$(gen)`, `${{ variables.gen }}`, `$GEN` or `${GEN}` gets the flags after it renamed.
A GitLab CI list item with a `value` key under `variables` is no longer read as a variable.
