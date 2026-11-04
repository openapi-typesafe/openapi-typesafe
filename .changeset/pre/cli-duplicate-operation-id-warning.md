---
"openapi-typesafe": patch
---

The CLI now warns when two operations share an `operationId`. The generated file declares the
operation twice in `operations` and does not compile without `skipLibCheck`. The warning does not
change the output or the exit code; the Node API already rejects such a schema.
