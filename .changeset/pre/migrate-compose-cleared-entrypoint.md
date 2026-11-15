---
"openapi-typesafe-migrate": patch
---

A Compose service that clears an entrypoint it merges (`entrypoint: []`, `entrypoint: null`,
`entrypoint: !reset []`) no longer gets the merged generator's flags renamed in its own
command: `grep -it todo src` stays as written.
