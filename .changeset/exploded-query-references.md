---
"openapi-typesafe": patch
---

`--fix exploded-query-objects`: the `--enum-values` arrays of an exploded object parameter read their type under `query`, where its keys are, and a `$ref` to an operation's or path item's exploded parameter is typed by the parameter's schema. Both pointed at the parameter's name inside `query` before and did not compile.
