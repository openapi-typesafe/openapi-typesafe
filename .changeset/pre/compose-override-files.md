---
"openapi-typesafe-migrate": patch
---

A Compose service that another Compose file of the same folder also gives an `entrypoint` or a
`command` (`compose.override.yaml`, or a file given with `-f`) is now reported instead of changed:
the container it runs depends on the files that `docker compose` merges, which the tool cannot
tell.
