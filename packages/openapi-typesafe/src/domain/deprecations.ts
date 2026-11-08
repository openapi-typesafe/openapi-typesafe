/**
 * Deprecations of what 2.0 removes. Each one is a Node.js `DeprecationWarning` with one of these
 * codes, so `--no-deprecation`, `--throw-deprecation`, `--trace-deprecation` and
 * `process.on("warning")` work on it as on Node's own (ADR-004, amendment of 2026-11-08).
 */

/** Every deprecation code. */
export const DEPRECATION_CODES = {
  OPENAPI_TYPESAFE_DEP_STRING_TO_AST: "OPENAPI_TYPESAFE_DEP_STRING_TO_AST",
  OPENAPI_TYPESAFE_DEP_TS_TRANSFORM: "OPENAPI_TYPESAFE_DEP_TS_TRANSFORM",
  OPENAPI_TYPESAFE_DEP_TS_POST_TRANSFORM: "OPENAPI_TYPESAFE_DEP_TS_POST_TRANSFORM",
  OPENAPI_TYPESAFE_DEP_TS_TRANSFORM_PROPERTY: "OPENAPI_TYPESAFE_DEP_TS_TRANSFORM_PROPERTY",
} as const;

export type DeprecationCode = (typeof DEPRECATION_CODES)[keyof typeof DEPRECATION_CODES];
