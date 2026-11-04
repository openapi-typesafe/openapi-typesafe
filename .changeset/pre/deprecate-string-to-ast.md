---
"openapi-typesafe": patch
---

`stringToAST()` is deprecated (removed in 2.0). It works as before through the TypeScript bridge and emits one Node `DeprecationWarning` (code `OPENAPI_TYPESAFE_DEP_STRING_TO_AST`). Return TypeScript type text from an IR callback (`irCallbacks: true`) instead.
