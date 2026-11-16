---
"openapi-typesafe": patch
---

A `transform` without `irCallbacks: true` that returns type text (`"Date"`) or a number is still
ignored, as in openapi-typescript 7, but the run now warns once with `CALLBACK_RESULT_IGNORED`,
naming the schema path, and says to set `irCallbacks: true` to return type text.
