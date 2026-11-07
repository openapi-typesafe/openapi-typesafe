---
"openapi-typesafe": minor
---

Document limits fail with typed errors instead of crashes or hangs: nesting too deep
(`SCHEMA_TOO_DEEP`), `$ref` cycles with no schema between (`SCHEMA_REF_INVALID`), keys the loader
cannot read such as `valueOf` or `constructor` (`SCHEMA_KEY_UNSUPPORTED`), YAML alias bombs
(`SCHEMA_PARSE_FAILED`), and remote documents that take over 60 seconds.
