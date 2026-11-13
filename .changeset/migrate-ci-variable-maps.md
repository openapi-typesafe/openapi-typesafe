---
"openapi-typesafe-migrate": patch
---

The generator set in the variables of more files is migrated, as in a workflow `env`: GitLab CI
`variables` (also `{ value: … }`), CircleCI, Drone and Woodpecker `environment`, Docker Compose
`environment` (a map or `NAME=value` items), and Taskfile `vars` and `env`. A Taskfile command
that names a variable as `{{.GEN}}` gets the flags after it renamed, as after `$GEN`. Before,
these values kept the old name, and the report could say that nothing was found.
