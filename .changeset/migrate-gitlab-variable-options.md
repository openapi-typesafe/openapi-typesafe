---
"openapi-typesafe-migrate": patch
---

The migration renames the `options` of a GitLab CI variable together with its `value`, and reads
each option as a value the variable can have. Before, only the value was renamed, so it was no
longer one of the options and GitLab rejected the pipeline.
