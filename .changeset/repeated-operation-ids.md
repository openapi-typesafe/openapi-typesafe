---
"openapi-typesafe": patch
---

Operations with a repeated `operationId` get distinct keys in `operations`, so the output
compiles. Before, the interface had two members of one name (TS2300). The first operation in
document order keeps the ID and each later one gets the lowest number from 2 that no other
operation has as its ID (`listItems2`, the name `--make-paths-enum` gives it in `ApiPaths`). The
`LINT_PROBLEM` warning for the rule `operation-operationId-unique` stays.
