---
"openapi-typesafe": patch
---

The CLI with a `redocly.yaml` or a `.redocly.lint-ignore.yaml` that cannot be parsed printed
"Unexpected error" with a stack trace and exited with 70, the code for a bug. It now prints one
line that names the file and the reason, with the new error code `CLI_CONFIG_INVALID`, and exits
with 2, the code for a wrong Redocly config.
