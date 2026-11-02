---
"openapi-typesafe": patch
---

A YAML document whose aliases (`*name`) expand it far beyond its written size (a "billion laughs"
document) now fails at once with `SCHEMA_PARSE_FAILED`. Before, the run took minutes and ended
with "RangeError: Set maximum size exceeded". Real documents that reuse anchors are not affected:
the limit starts at 1,000,000 expanded nodes and 100 times the written size.
