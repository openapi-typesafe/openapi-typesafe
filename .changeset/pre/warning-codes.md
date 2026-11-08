---
"openapi-typesafe": minor
---

Every warning ends with a stable code (exported as `WARNING_CODES`); lint warnings name their
Redocly rule. New warnings, which change neither output nor exit code: a repeated `operationId`,
paths that differ only in parameter names, a discriminator value its member does not allow, an
unknown `x-openapi-ts` key, and an unknown CLI flag.
