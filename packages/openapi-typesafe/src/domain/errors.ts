/**
 * Typed errors (ENGINEERING_PLAN 4.6, ADR-011). Every expected failure of the generator and the CLI
 * is an `OpenAPITypesafeError` with a stable machine-readable `code` and structured `details`. The
 * `message` is English text for people; programs and the CLI decide by `code`. A bug (a broken
 * invariant) is a plain `Error`, not one of these.
 */

/** Every error code. The set is closed: a new code must be handled by the CLI exit-code table. */
export const ERROR_CODES = {
  SCHEMA_SOURCE_EMPTY: "SCHEMA_SOURCE_EMPTY",
  SCHEMA_SOURCE_INVALID: "SCHEMA_SOURCE_INVALID",
  SCHEMA_LOAD_FAILED: "SCHEMA_LOAD_FAILED",
  SCHEMA_PARSE_FAILED: "SCHEMA_PARSE_FAILED",
  SCHEMA_VERSION_UNSUPPORTED: "SCHEMA_VERSION_UNSUPPORTED",
  SCHEMA_INVALID: "SCHEMA_INVALID",
  SCHEMA_REF_INVALID: "SCHEMA_REF_INVALID",
  SCHEMA_OBJECT_INVALID: "SCHEMA_OBJECT_INVALID",
  SCHEMA_PROPERTY_INVALID: "SCHEMA_PROPERTY_INVALID",
  SCHEMA_TOO_DEEP: "SCHEMA_TOO_DEEP",
  SCHEMA_KEY_UNSUPPORTED: "SCHEMA_KEY_UNSUPPORTED",
  ENUM_NAME_EMPTY: "ENUM_NAME_EMPTY",
  CALLBACK_RESULT_UNREADABLE: "CALLBACK_RESULT_UNREADABLE",
  TYPESCRIPT_NOT_FOUND: "TYPESCRIPT_NOT_FOUND",
  CLI_FLAG_REMOVED: "CLI_FLAG_REMOVED",
  CLI_GLOB_UNSUPPORTED: "CLI_GLOB_UNSUPPORTED",
  CLI_CONFIG_NOT_FOUND: "CLI_CONFIG_NOT_FOUND",
  CLI_CONFIG_OUTPUT_MISSING: "CLI_CONFIG_OUTPUT_MISSING",
  OUTPUT_STALE: "OUTPUT_STALE",
  OUTPUT_READ_FAILED: "OUTPUT_READ_FAILED",
  OUTPUT_WRITE_FAILED: "OUTPUT_WRITE_FAILED",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** Structured, JSON-serializable facts about a failure, for programs and logs. */
export type ErrorDetails = Readonly<Record<string, unknown>>;

export interface OpenAPITypesafeErrorInit {
  readonly code: ErrorCode;
  readonly message: string;
  readonly details?: ErrorDetails;
  /** The lower-level error this one reports, if any (kept as the standard `cause`). */
  readonly cause?: unknown;
}

/** The base of every expected failure; check `code`, not the class or the message. */
export class OpenAPITypesafeError extends Error {
  readonly code: ErrorCode;
  readonly details: ErrorDetails;

  constructor(init: OpenAPITypesafeErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = "OpenAPITypesafeError";
    this.code = init.code;
    this.details = init.details ?? {};
  }
}

/** Whether a thrown value is one of our typed errors (also across bundled copies of the class). */
export function isOpenAPITypesafeError(value: unknown): value is OpenAPITypesafeError {
  if (value instanceof OpenAPITypesafeError) {
    return true;
  }
  const code = (value as { code?: unknown } | null)?.code;
  return (
    value instanceof Error &&
    typeof code === "string" &&
    Object.hasOwn(ERROR_CODES, code) &&
    typeof (value as { details?: unknown }).details === "object"
  );
}
