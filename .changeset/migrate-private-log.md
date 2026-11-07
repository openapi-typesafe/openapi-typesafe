---
"openapi-typesafe-migrate": patch
---

The default log file is no longer at a path that another user can guess. It was
`<tmp>/openapi-typesafe-migrate/<time>.jsonl`, so on a shared host someone could create that
folder first and plant a link there, and the run appended its log to the link's target. Each run
now gets a new folder from `mkdtemp` (mode 0700) and creates its log file exclusively (mode 0600).
