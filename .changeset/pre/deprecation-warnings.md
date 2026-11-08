---
"openapi-typesafe": patch
---

Every deprecation of something 2.0 removes is now a Node.js `DeprecationWarning` with an
`OPENAPI_TYPESAFE_DEP_*` code, shown once per process. The TypeScript-node forms of `transform`,
`postTransform` and `transformProperty` used to print a warning line with the code
`LEGACY_CALLBACK_DEPRECATED` through the generator's logger; they now emit
`OPENAPI_TYPESAFE_DEP_TS_TRANSFORM`, `OPENAPI_TYPESAFE_DEP_TS_POST_TRANSFORM` and
`OPENAPI_TYPESAFE_DEP_TS_TRANSFORM_PROPERTY`, as `stringToAST()` emits
`OPENAPI_TYPESAFE_DEP_STRING_TO_AST`. `node --no-deprecation` hides them, `--throw-deprecation`
makes them errors, and `silent` no longer hides them. The new `DEPRECATION_CODES` export lists the
codes; `STRING_TO_AST_DEPRECATION_CODE` and the `LEGACY_CALLBACK_DEPRECATED` warning code, which
only rc versions had, are removed.
