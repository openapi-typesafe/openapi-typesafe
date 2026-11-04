---
"openapi-typesafe": patch
---

`--root-types` names no longer keep letters that the running Node.js knows and TypeScript's scanner
does not (Unicode 16 and 17 letters such as `꟒`): they become `_`, so the generated file parses.
Before, such a schema name gave "Invalid character" errors. See ADR-019.
