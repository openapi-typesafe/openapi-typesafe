import type { SchemaObject } from "./schema-object.js";

/**
 * Which string schemas describe raw binary data, following "Working with Binary Data" of the
 * OpenAPI specification (3.1): `format: binary` in 3.0, a `contentMediaType` without a
 * `contentEncoding` in 3.1. `--binary-as-blob` types these as `Blob`.
 * https://spec.openapis.org/oas/v3.1.1.html#working-with-binary-data
 */

/** The OpenAPI 3.0 format of unencoded octets (`byte` is base64 text). */
const BINARY_FORMAT = "binary";

/** The top-level media type whose contents are always text (RFC 2046). */
const TEXT_TOP_LEVEL_TYPE = "text";

/** The top-level media type of the text formats in `TEXT_APPLICATION_SUBTYPES`. */
const APPLICATION_TOP_LEVEL_TYPE = "application";

/**
 * Text syntaxes, as a subtype (`application/json`) or a structured syntax suffix
 * (`application/problem+json`, `image/svg+xml`; RFC 6839, RFC 9512).
 */
const TEXT_STRUCTURED_SYNTAXES: ReadonlySet<string> = new Set(["json", "xml", "yaml"]);

/** Other text formats under `application/`, registered or in common use. */
const TEXT_APPLICATION_SUBTYPES: ReadonlySet<string> = new Set([
  "ecmascript",
  "graphql",
  "javascript",
  "json-seq",
  "jsonl",
  "sql",
  "x-ndjson",
  "x-www-form-urlencoded",
  "x-yaml",
]);

const PARAMETER_SEPARATOR = ";";
const SUBTYPE_SEPARATOR = "/";
const SUFFIX_SEPARATOR = "+";

/**
 * Whether a media type's contents are text, so a string schema with it holds the text itself.
 * Parameters (`; charset=utf-8`) and case are ignored; a value without a subtype is not text.
 */
export function isTextualMediaType(mediaType: string): boolean {
  const essence = (mediaType.split(PARAMETER_SEPARATOR)[0] ?? "").trim().toLowerCase();
  const [topLevelType, subtype] = essence.split(SUBTYPE_SEPARATOR);
  if (topLevelType === undefined || subtype === undefined) {
    return false;
  }
  if (topLevelType === TEXT_TOP_LEVEL_TYPE) {
    return true;
  }
  const suffix = subtype.slice(subtype.lastIndexOf(SUFFIX_SEPARATOR) + 1);
  if (TEXT_STRUCTURED_SYNTAXES.has(subtype) || TEXT_STRUCTURED_SYNTAXES.has(suffix)) {
    return true;
  }
  return topLevelType === APPLICATION_TOP_LEVEL_TYPE && TEXT_APPLICATION_SUBTYPES.has(subtype);
}

/**
 * Whether a schema describes raw (unencoded) binary data. Any `contentEncoding` means the value
 * is encoded text, so it wins over `format: binary`.
 */
export function isRawBinarySchema(schema: SchemaObject): boolean {
  if (schema.contentEncoding !== undefined) {
    return false;
  }
  if (schema.format === BINARY_FORMAT) {
    return true;
  }
  return schema.contentMediaType !== undefined && !isTextualMediaType(schema.contentMediaType);
}
