---
"openapi-typesafe-migrate": patch
---

Compose files that `docker compose` reads together are migrated together. An override file
(`docker-compose.override.yml`, `compose.override.yaml`) whose service gets its `command` or
`entrypoint` from the other file, a service whose `extends` names another file, and the service
of that file it extends are listed to fix by hand with their old flags, also when only the other
file names the package. Before, the file that did not name the package was not read, so its
`-it` was never mentioned.
