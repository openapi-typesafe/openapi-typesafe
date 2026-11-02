import { ERROR_CODES, OpenAPITypesafeError } from "../../domain/errors.js";

/**
 * The typed errors of loading, validating and bundling a document (ADR-011). Messages are the
 * original messages, so Node API users who match on them keep working.
 */

/** No source was given, or the source is empty. */
export function sourceEmptyError(message: string): OpenAPITypesafeError {
  return new OpenAPITypesafeError({ code: ERROR_CODES.SCHEMA_SOURCE_EMPTY, message });
}

/** The source is neither a URL, text, buffer, stream nor plain object. */
export function sourceInvalidError(source: unknown): OpenAPITypesafeError {
  const received = Array.isArray(source) ? "Array" : typeof source;
  return new OpenAPITypesafeError({
    code: ERROR_CODES.SCHEMA_SOURCE_INVALID,
    message: `Expected string, object, or Buffer. Got ${received}`,
    details: { received },
  });
}

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Reading the document from a file or URL failed; the message is the reader's message. */
export function loadFailedError(absoluteRef: string, cause: unknown): OpenAPITypesafeError {
  return new OpenAPITypesafeError({
    code: ERROR_CODES.SCHEMA_LOAD_FAILED,
    message: causeMessage(cause),
    details: { source: absoluteRef },
    cause,
  });
}

/** The document text is not valid JSON or YAML; the message is the parser's message. */
export function parseFailedError(
  format: "json" | "yaml",
  absoluteRef: string,
  cause: unknown,
): OpenAPITypesafeError {
  return new OpenAPITypesafeError({
    code: ERROR_CODES.SCHEMA_PARSE_FAILED,
    message: causeMessage(cause),
    details: { format, source: absoluteRef },
    cause,
  });
}

/** The document is not OpenAPI 3.x. */
export function versionUnsupportedError(
  message: string,
  parsed: Readonly<Record<string, unknown>>,
): OpenAPITypesafeError {
  return new OpenAPITypesafeError({
    code: ERROR_CODES.SCHEMA_VERSION_UNSUPPORTED,
    message,
    details: { openapi: parsed.openapi, swagger: parsed.swagger },
  });
}

/**
 * Linting or bundling found errors. The message is the last error, as in the original; all error
 * messages are in `details.problems`.
 */
export function schemaInvalidError(problems: readonly string[]): OpenAPITypesafeError {
  return new OpenAPITypesafeError({
    code: ERROR_CODES.SCHEMA_INVALID,
    message: problems.at(-1) ?? "",
    details: { problems: [...problems] },
  });
}

/** A `$ref` chain points back to itself with no schema in between (`A: $ref B`, `B: $ref A`). */
export function refCycleError(cause: Error): OpenAPITypesafeError {
  return new OpenAPITypesafeError({
    code: ERROR_CODES.SCHEMA_REF_INVALID,
    message: cause.message,
    details: { reason: "cycle" },
    cause,
  });
}

function hostListText(hosts: readonly string[]): string {
  return hosts.length === 0 ? "none" : hosts.join(", ");
}

/** Why a `$ref` document was refused, with the limit it broke (ADR-017). */
export type RefRefusalDetails =
  | { readonly reason: "outside-local-root"; readonly localRoot: string }
  | { readonly reason: "host-not-allowed"; readonly allowedHosts: readonly string[] };

/** A `$ref` is outside the local root, or its host is not allowed (threat model R1, R2). */
export function refForbiddenError(ref: string, details: RefRefusalDetails): OpenAPITypesafeError {
  const limit =
    details.reason === "outside-local-root"
      ? `it is outside the local $ref root ${details.localRoot}`
      : `its host is not in the allowed remote $ref hosts (${hostListText(details.allowedHosts)})`;
  return new OpenAPITypesafeError({
    code: ERROR_CODES.SCHEMA_REF_FORBIDDEN,
    message: `Refused to load ${ref}: ${limit}`,
    details: { ref, ...details },
  });
}
