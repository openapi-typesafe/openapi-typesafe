---
"openapi-typesafe-migrate": patch
---

The migration keeps the old flags after a variable whose program is decided when the job runs,
and lists them as a manual step: a workflow `env` set by an expression
(`GEN: ${{ vars.GEN || 'npx openapi-typescript' }}` or `GEN: ${{ vars.GEN }}`, used as `$GEN`), a
Makefile `GEN ?= npx openapi-typescript`, which the environment can override, and a Makefile value
that make computes (`GEN := $(or $(X),npx openapi-typescript)`). Before, the flags after `$GEN`
were renamed without a word, or kept without a word, though `$GEN` may run another program.
