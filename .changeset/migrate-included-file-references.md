---
"openapi-typesafe-migrate": patch
---

A file that a Taskfile includes or an Azure Pipelines template now reports the old flags after
`{{.GEN}}` or `$(gen)` when the including file sets that variable to the generator. Before, only
`$GEN` was reported there and the other forms kept their flags silently.
