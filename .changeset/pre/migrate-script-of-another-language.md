---
"openapi-typesafe-migrate": patch
---

A justfile recipe whose first line is a shebang for another program (`#!/usr/bin/env python3`), and
code given on the command line (`python3 -c '…'`, `node -e "…"`, `ruby -e '…'`), are no longer
read as shell commands. When such code names an old package, it is listed as a manual step
("the script runs with python3, …"); before, it was neither changed nor reported, or a command
line inside it was rewritten.
