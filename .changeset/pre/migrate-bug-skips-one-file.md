---
"openapi-typesafe-migrate": patch
---

When a bug of the tool would corrupt one file, only that file is left as it was: the report lists
it under "Skipped" with the reason and asks you to migrate it by hand, the other files are still
migrated (and written with `--write`), and the command exits with `1`. Before, such a bug stopped
the whole run and nothing was migrated.
