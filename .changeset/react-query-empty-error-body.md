---
"openapi-typesafe-react-query": patch
---

Queries, infinite queries and mutations fail on every non-OK response. Before, a 4xx/5xx response without a body (`error: undefined`) or with a falsy body such as `0` counted as success (ADR-013). Fixes upstream #2070, #2531 (as #2829 proposed).
