---
"openapi-typesafe": patch
---

New opt-in fix `dedupe-enum-names` (`--enum --dedupe-enums --fix dedupe-enum-names`): a shared
enum is named by a rule that does not depend on the document order (its component schema, else the
shortest name, else code-unit order), so adding a schema no longer renames it
(openapi-typescript #1683).
