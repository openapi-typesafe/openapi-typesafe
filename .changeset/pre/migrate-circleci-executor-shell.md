---
"openapi-typesafe-migrate": patch
---

A CircleCI job now takes the `shell` of the executor it names (`executor: py` with
`executors.py.shell: /usr/bin/python3`), so the Python code of its steps is no longer rewritten as
a command line; a step that names an old package is listed as a manual step. The job's own `shell`
still wins.
