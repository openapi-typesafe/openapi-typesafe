---
"openapi-typesafe-migrate": patch
---

A Compose service now gets the `entrypoint` and `command` it does not set from the service its
`extends` names in the same file, so the old flags of a `command` after an inherited generator
entrypoint are renamed. A service whose `extends` names another file is reported instead.
