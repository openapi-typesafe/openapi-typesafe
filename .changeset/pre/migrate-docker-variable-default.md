---
"openapi-typesafe-migrate": patch
---

A Dockerfile `ARG` or `ENV` whose value has a shell default, such as
`ENV GEN=${GEN:-npx openapi-typescript}`, no longer stops the whole migration with "Edits overlap"
and exit code 1: the default is renamed once, like any other `ARG` or `ENV` value.
