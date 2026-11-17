---
"openapi-typesafe-migrate": patch
---

A Kubernetes or Compose list item that holds a whole command line
(`args: ["npx openapi-typescript api.yaml -it"]`) is listed to fix by hand, with the renames it
needs. Before, only a list of separate items was reported, and such an item was skipped.
