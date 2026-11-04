---
"openapi-typesafe": minor
---

Add typed errors: every expected failure is an `OpenAPITypesafeError` with a stable `code` and structured `details` (exported with `ERROR_CODES` and `isOpenAPITypesafeError`). Messages are unchanged; a reader or parser error is kept as `cause` (check `error.cause.code` instead of `error.code === "ENOENT"`). The CLI now prints one line per failure with its code and exits with a documented code: `1` stale output with `--check` (as before), `2` usage or configuration, `3` input document, `4` output files, `70` unexpected error. Other failures used to exit with `1` (ADR-011).
