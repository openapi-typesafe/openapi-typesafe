---
"openapi-typesafe": patch
---

A `redocly` option made with `@redocly/openapi-core` 1.25 or earlier now fails with `OPTION_INVALID`,
which says that 1.26 or later is needed, instead of a plain `TypeError` during the run.
