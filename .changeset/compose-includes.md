---
"openapi-typesafe-migrate": patch
---

The files that a Compose file's top-level `include` names are now read as Compose files, relative
to the including file and through nested includes. A service that another merged file also gives
an `entrypoint` or `command`, a service defined again after a file that includes it (which Compose
rejects), and an include whose file is missing, outside the project, remote or part of a cycle are
reported instead of being changed or skipped.
