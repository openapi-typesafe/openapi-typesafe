import { assertNever } from "../../domain/assert-never.js";
import { ERROR_CODES, OpenAPITypesafeError } from "../../domain/errors.js";
import { redactUnparsedUrl, redactUrlSecrets } from "../../domain/url-secrets.js";

/**
 * The typed errors of loading, validating and bundling a document (ADR-011). Messages are the
 * original messages, so Node API users who match on them keep working; URLs in them and in the
 * details never show user info.
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

/**
 * Why text is no schema source (`details.reason` of `SCHEMA_SOURCE_INVALID`): a location that is
 * not a valid URL, only a YAML string, such as a file path, or a relative `file:` URL with a cwd
 * that is no `file:` URL. The CLI reports the first two for stdin; its cwd is always local.
 */
export const SOURCE_TEXT_REASONS = {
  url: "url",
  path: "path",
  relativeFile: "relative-file",
} as const;

/** How a message names the text of a source, by where it came from. */
const TEXT_SOURCE_NAMES: Readonly<Record<TextOrigin, string>> = {
  string: "The string",
  stream: "The stream text",
};

/**
 * Text that is a location does not parse as a URL. `details.text` is the location, redacted, so
 * the CLI can report it for stdin as it reports its schema argument.
 */
export function urlInvalidError(location: string, origin: TextOrigin): OpenAPITypesafeError {
  const shown = redactUnparsedUrl(location);
  return new OpenAPITypesafeError({
    code: ERROR_CODES.SCHEMA_SOURCE_INVALID,
    message: `${TEXT_SOURCE_NAMES[origin]} ${shown} starts like a URL but is not a valid URL`,
    details: { reason: SOURCE_TEXT_REASONS.url, received: origin, text: shown },
  });
}

/**
 * Text that is a relative `file:` URL (`file:api.yaml`) names a file in a local cwd only. The URL
 * parser ignores a base of another scheme, so with an `https:` cwd it named `/api.yaml` in the
 * file system root.
 */
export function relativeFileUrlError(
  location: string,
  origin: TextOrigin,
  cwd: URL,
): OpenAPITypesafeError {
  const shown = redactUnparsedUrl(location);
  return new OpenAPITypesafeError({
    code: ERROR_CODES.SCHEMA_SOURCE_INVALID,
    message:
      `${TEXT_SOURCE_NAMES[origin]} ${shown} is a relative file: URL, which needs a file: cwd; ` +
      `cwd is a ${cwd.protocol} URL. Pass an absolute file: URL or a local cwd`,
    details: { reason: SOURCE_TEXT_REASONS.relativeFile, received: origin, text: shown },
  });
}

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Enough of a source string to recognise it in the message. */
const SOURCE_TEXT_IN_MESSAGE = 200;

/** Where document text that is only a YAML string came from. */
export type TextOrigin = "string" | "stream";

const LOAD_FILE_ADVICE =
  "To load a file, pass a URL: openapiTS(pathToFileURL(path)) from node:url.";

/**
 * A string source is document text, so a file path parses as a YAML string scalar, not as a
 * document (docs/node.md). The message says how to load the file instead. Text read from a
 * stream (stdin in the CLI) is named as such; `details.text` lets the CLI give its own advice.
 */
export function pathStringError(text: string, origin: TextOrigin): OpenAPITypesafeError {
  const shown =
    text.length > SOURCE_TEXT_IN_MESSAGE ? `${text.slice(0, SOURCE_TEXT_IN_MESSAGE)}…` : text;
  const message =
    origin === "string"
      ? `The string "${shown}" was parsed as YAML text, not loaded as a file. ${LOAD_FILE_ADVICE}`
      : `The stream held only the YAML string "${shown}", not an OpenAPI document. ` +
        LOAD_FILE_ADVICE;
  return new OpenAPITypesafeError({
    code: ERROR_CODES.SCHEMA_SOURCE_INVALID,
    message,
    details: { reason: SOURCE_TEXT_REASONS.path, received: origin, text: shown },
  });
}

/** Reading the document from a file or URL failed; the message is the reader's message. */
export function loadFailedError(absoluteRef: string, cause: unknown): OpenAPITypesafeError {
  return new OpenAPITypesafeError({
    code: ERROR_CODES.SCHEMA_LOAD_FAILED,
    message: causeMessage(cause),
    details: { source: redactUrlSecrets(absoluteRef) },
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
    details: { format, source: redactUrlSecrets(absoluteRef) },
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
    details: { problems: problems.map(redactUrlSecrets) },
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
  | { readonly reason: "host-not-allowed"; readonly allowedHosts: readonly string[] }
  | { readonly reason: "local-ref-from-remote"; readonly base: string }
  | { readonly reason: "too-many-remote-documents"; readonly maxDocuments: number }
  | { readonly reason: "remote-document-too-large"; readonly maxDocumentBytes: number }
  | { readonly reason: "remote-documents-too-large"; readonly maxTotalBytes: number }
  | { readonly reason: "remote-documents-too-many-nodes"; readonly maxNodes: number };

const BYTES_PER_MEBIBYTE = 1024 * 1024;

/** A byte count in MiB, as the limits are chosen: `256 MiB`; a smaller limit in bytes. */
function sizeText(bytes: number): string {
  return bytes % BYTES_PER_MEBIBYTE === 0 ? `${bytes / BYTES_PER_MEBIBYTE} MiB` : `${bytes} bytes`;
}

function limitText(details: RefRefusalDetails): string {
  switch (details.reason) {
    case "outside-local-root":
      return `it is outside the local $ref root ${details.localRoot}`;
    case "host-not-allowed": {
      const hosts = hostListText(details.allowedHosts);
      return `its host is not in the allowed remote $ref hosts (${hosts})`;
    }
    case "local-ref-from-remote":
      return `it is not an http(s) URL, and the $ref is in the remote document ${details.base}`;
    case "too-many-remote-documents":
      return `the document refers to more than ${details.maxDocuments} remote documents`;
    case "remote-document-too-large":
      return `its body is larger than ${sizeText(details.maxDocumentBytes)} once decoded`;
    case "remote-documents-too-large": {
      const limit = sizeText(details.maxTotalBytes);
      return `the remote documents of this run are larger than ${limit} together once decoded`;
    }
    case "remote-documents-too-many-nodes": {
      const limit = details.maxNodes;
      return `the remote documents of this run parse into more than ${limit} nodes together`;
    }
    default:
      return assertNever(details);
  }
}

/**
 * A `$ref` is outside the local root, its host is not allowed (threat model R1, R2), a remote
 * document refers to a local file (T3), or there are too many or too large remote documents (T2).
 */
export function refForbiddenError(ref: string, details: RefRefusalDetails): OpenAPITypesafeError {
  const limit = limitText(details);
  return new OpenAPITypesafeError({
    code: ERROR_CODES.SCHEMA_REF_FORBIDDEN,
    message: `Refused to load ${ref}: ${limit}`,
    details: { ref: redactUrlSecrets(ref), ...details },
  });
}
