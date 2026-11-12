---
"openapi-typesafe-migrate": patch
---

A GitLab CI job named `openapi`, `swagger`, `asyncapi`, `overlay` or `arazzo` no longer makes the
whole `.gitlab-ci.yml` count as an API description, so its commands are migrated again. A YAML file
counts as an API description only when such a top-level key holds a version (`openapi: 3.1.0`), and
a CI config (`.gitlab-ci.yml`, a GitHub workflow, a CircleCI config, …) never does.
