---
"openapi-typesafe-migrate": patch
---

A YAML file that a Taskfile `includes`, a GitLab CI `include: local:` or an Azure Pipelines
`template:` names is now migrated as a file of the kind that includes it, whatever its name: its
`cmds`, `variables`, `$(gen)` macros and inputs are read as there. GitLab `*` and `**` patterns
are followed, and so are the files that included files include. Before, such a file was read as
plain YAML, and the report could say there was nothing to migrate.
