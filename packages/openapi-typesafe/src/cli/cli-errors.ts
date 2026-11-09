import {
  ERROR_CODES,
  type ErrorCode,
  isOpenAPITypesafeError,
  OpenAPITypesafeError,
} from "../domain/errors.js";

/**
 * How the CLI reports a failure (ENGINEERING_PLAN 4.6, ADR-011): each error code maps to a process
 * exit code and the line printed for it. The table is exhaustive, so a new error code does not
 * compile until the CLI handles it.
 */

/** Process exit codes of the CLI, documented in docs/cli.md. */
export const EXIT_CODES = {
  SUCCESS: 0,
  /** `--check` found output that differs from the generated types (as in the original CLI). */
  OUTPUT_STALE: 1,
  /** A flag, the Redocly config, the environment or a callback is wrong. */
  USAGE: 2,
  /** The OpenAPI document cannot be read, is invalid, or cannot be converted. */
  SCHEMA: 3,
  /** An output file cannot be read or written. */
  OUTPUT: 4,
  /** An unexpected failure: a bug in the generator (sysexits `EX_SOFTWARE`). */
  INTERNAL: 70,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

interface CliErrorReport {
  readonly exitCode: ExitCode;
  /** The printed text; the error's own message when absent. */
  readonly message?: (error: OpenAPITypesafeError) => string;
}

/** Problems are printed one by one while linting, so the summary only counts them. */
function schemaInvalidMessage(error: OpenAPITypesafeError): string {
  const count = Array.isArray(error.details.problems) ? error.details.problems.length : 1;
  return `The OpenAPI document has ${count} ${count === 1 ? "error" : "errors"} (see above)`;
}

/**
 * Node's `fetch` fails with only "fetch failed"; the network reason (refused, DNS, TLS) is the
 * cause of that error. The Node API keeps the original message, so only the CLI adds it.
 */
function loadFailedMessage(error: OpenAPITypesafeError): string {
  const reason = error.cause instanceof Error ? error.cause.cause : undefined;
  if (!(reason instanceof Error)) {
    return error.message;
  }
  // `loadFailedError`, the only source of this code, always sets the source.
  return `${error.message}: ${reason.message} (${String(error.details.source)})`;
}

/** The message js-yaml throws at its nesting limit (docs/security/threat-model.md T2). */
const YAML_DEPTH_LIMIT_MESSAGE = /nesting exceeded maxDepth \((\d+)\)/;

/** The parser's message says the limit, not how to stay under it. */
function parseFailedMessage(error: OpenAPITypesafeError): string {
  const limit = YAML_DEPTH_LIMIT_MESSAGE.exec(error.message)?.[1];
  if (limit === undefined) {
    return error.message;
  }
  return (
    `${error.message}. The YAML parser reads at most ${limit} nested levels: ` +
    "move nested schemas to `components` and reference them with `$ref`"
  );
}

/**
 * Text piped into stdin that is only a YAML string (`echo api.yaml | openapi-typesafe`) gets the
 * CLI's advice, not the Node API's (`openapiTS(pathToFileURL(path))`).
 */
function sourceInvalidMessage(error: OpenAPITypesafeError): string {
  const { received, text } = error.details;
  if (received !== "stream" || typeof text !== "string") {
    return error.message;
  }
  return (
    `stdin held only the YAML string "${text}", not an OpenAPI document. To read a file, pass ` +
    "its path or URL as the first argument: openapi-typesafe ./openapi.yaml -o ./schema.ts"
  );
}

const CLI_ERROR_REPORTS: Readonly<Record<ErrorCode, CliErrorReport>> = {
  SCHEMA_SOURCE_EMPTY: { exitCode: EXIT_CODES.SCHEMA },
  SCHEMA_SOURCE_INVALID: { exitCode: EXIT_CODES.SCHEMA, message: sourceInvalidMessage },
  SCHEMA_LOAD_FAILED: { exitCode: EXIT_CODES.SCHEMA, message: loadFailedMessage },
  SCHEMA_PARSE_FAILED: { exitCode: EXIT_CODES.SCHEMA, message: parseFailedMessage },
  SCHEMA_VERSION_UNSUPPORTED: { exitCode: EXIT_CODES.SCHEMA },
  SCHEMA_INVALID: { exitCode: EXIT_CODES.SCHEMA, message: schemaInvalidMessage },
  SCHEMA_REF_INVALID: { exitCode: EXIT_CODES.SCHEMA },
  SCHEMA_REF_FORBIDDEN: { exitCode: EXIT_CODES.SCHEMA },
  SCHEMA_OBJECT_INVALID: { exitCode: EXIT_CODES.SCHEMA },
  SCHEMA_PROPERTY_INVALID: { exitCode: EXIT_CODES.SCHEMA },
  SCHEMA_TOO_DEEP: { exitCode: EXIT_CODES.SCHEMA },
  SCHEMA_KEY_UNSUPPORTED: { exitCode: EXIT_CODES.SCHEMA },
  ENUM_NAME_EMPTY: { exitCode: EXIT_CODES.SCHEMA },
  CALLBACK_RESULT_UNREADABLE: { exitCode: EXIT_CODES.USAGE },
  OPTION_FIX_UNKNOWN: { exitCode: EXIT_CODES.USAGE },
  OPTION_INVALID: { exitCode: EXIT_CODES.USAGE },
  TYPESCRIPT_NOT_FOUND: { exitCode: EXIT_CODES.USAGE },
  CLI_FLAG_REMOVED: { exitCode: EXIT_CODES.USAGE },
  CLI_FLAG_INVALID: { exitCode: EXIT_CODES.USAGE },
  CLI_GLOB_UNSUPPORTED: { exitCode: EXIT_CODES.USAGE },
  CLI_CONFIG_NOT_FOUND: { exitCode: EXIT_CODES.USAGE },
  CLI_CONFIG_INVALID: { exitCode: EXIT_CODES.USAGE },
  CLI_CONFIG_OUTPUT_MISSING: { exitCode: EXIT_CODES.USAGE },
  CLI_CHECK_OUTPUT_MISSING: { exitCode: EXIT_CODES.USAGE },
  CLI_INPUT_MISSING: { exitCode: EXIT_CODES.USAGE },
  CLI_OUTPUT_IS_INPUT: { exitCode: EXIT_CODES.USAGE },
  CLI_OUTPUT_DUPLICATE: { exitCode: EXIT_CODES.USAGE },
  CLI_OUTPUT_INVALID: { exitCode: EXIT_CODES.USAGE },
  CLI_LOCATION_INVALID: { exitCode: EXIT_CODES.USAGE },
  OUTPUT_STALE: { exitCode: EXIT_CODES.OUTPUT_STALE },
  OUTPUT_READ_FAILED: { exitCode: EXIT_CODES.OUTPUT },
  OUTPUT_WRITE_FAILED: { exitCode: EXIT_CODES.OUTPUT },
};

/** What the CLI prints and returns for a thrown value. */
export interface CliFailure {
  readonly exitCode: ExitCode;
  readonly message: string;
}

/**
 * Map a thrown value to the CLI's output. A typed error prints one line with its code; anything
 * else is a bug and prints its stack, so it can be reported.
 */
export function describeCliFailure(error: unknown): CliFailure {
  if (error instanceof ApiFailure) {
    const failure = describeCliFailure(error.cause);
    return { ...failure, message: `API ${error.apiName}: ${failure.message}` };
  }
  if (!isOpenAPITypesafeError(error)) {
    const text = error instanceof Error ? (error.stack ?? error.message) : String(error);
    return { exitCode: EXIT_CODES.INTERNAL, message: `Unexpected error: ${text}` };
  }
  const report = CLI_ERROR_REPORTS[error.code];
  const message = report.message?.(error) ?? error.message;
  return { exitCode: report.exitCode, message: `${message} (${error.code})` };
}

/**
 * A failure of one API of a Redocly config. The CLI reports its cause with the API named first,
 * as the config errors of an API are; the cause keeps its code and so its exit code.
 */
export class ApiFailure extends Error {
  override readonly name = "ApiFailure";
  override readonly cause: unknown;
  readonly apiName: string;

  constructor(apiName: string, cause: unknown) {
    super(`API ${apiName} failed`, { cause });
    this.apiName = apiName;
    this.cause = cause;
  }
}

/** Errors of the CLI itself; its messages are the original CLI's messages. */
export function cliError(
  code: Extract<ErrorCode, `CLI_${string}` | `OUTPUT_${string}`>,
  message: string,
  cause?: unknown,
): OpenAPITypesafeError {
  return new OpenAPITypesafeError({ code: ERROR_CODES[code], message, cause });
}
