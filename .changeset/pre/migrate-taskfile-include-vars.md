---
"openapi-typesafe-migrate": patch
---

A Taskfile include that sets a variable for the file it includes
(`includes: { other: { taskfile: ./other.yml, vars: { GEN: grep } } }`) is read: when it sets
the variable to another program, `{{.GEN}} -it` in that file is no longer reported as a possible
generator command.
