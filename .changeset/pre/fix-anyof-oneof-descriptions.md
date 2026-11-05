---
"openapi-typesafe": patch
---

New opt-in fix `anyof-oneof-descriptions` (`--fix anyof-oneof-descriptions`): the JSDoc of a
property or schema lists the `description` of each `anyOf` and `oneOf` member, which was dropped
(openapi-typescript #2142).
