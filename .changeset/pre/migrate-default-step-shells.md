---
"openapi-typesafe-migrate": patch
---

A CI script now runs with the shell that CI gives it: the step's own `shell`, then the job's and
the workflow's `defaults.run.shell` in GitHub Actions, or the job's `shell` in CircleCI. A Python
or Node script under such a default is left and reported instead of rewritten as shell, and
`shell: /usr/bin/env bash -e {0}`, `shell: msys2 {0}` and `shell: wsl-bash {0}` are read as bash
again, so their commands are migrated.
