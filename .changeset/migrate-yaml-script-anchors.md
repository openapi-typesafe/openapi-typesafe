---
"openapi-typesafe-migrate": patch
---

Commands that a YAML anchor shares are migrated where they are written, when an alias uses them
under a command key: a GitLab `.gen_scripts: &gen_scripts` list used as
`script: [*gen_scripts]`, an anchored `env` map, a Taskfile command. Before, such a file was
neither changed nor reported ("Nothing to migrate"), and the job kept running the old generator.
