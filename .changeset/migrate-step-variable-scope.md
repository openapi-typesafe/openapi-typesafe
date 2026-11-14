---
"openapi-typesafe-migrate": patch
---

A variable that a step, a job or a stage written as a list item sets (an Azure Pipelines or
GitHub Actions step `env`, an Azure stage's `variables`) now counts for the commands of that item
only. Before, it counted for the whole file, so the flags after `$GEN` in another step were
renamed although `GEN` was not set there.
