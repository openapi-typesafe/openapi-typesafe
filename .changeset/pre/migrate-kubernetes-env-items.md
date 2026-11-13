---
"openapi-typesafe-migrate": patch
---

A Kubernetes container `env` item whose value names an old package
(`- name: GEN / value: npx openapi-typescript`) is now listed in the report as a step to do by
hand. No shell reads such a value, so the tool does not change it. Before, it was not reported.
