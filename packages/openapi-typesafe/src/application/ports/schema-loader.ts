import type { OpenAPI3, SchemaSource } from "../../types.js";

export interface SchemaLoadRequest {
  readonly source: SchemaSource;
  /** The base for relative `$ref`s of a source that is not a URL (a directory URL). */
  readonly cwd: URL;
}

/**
 * Read, validate and bundle an OpenAPI 3 document into one document (ENGINEERING_PLAN 4.5).
 * Fails with a typed error (ADR-011): `SCHEMA_SOURCE_*`, `SCHEMA_LOAD_FAILED`,
 * `SCHEMA_PARSE_FAILED`, `SCHEMA_VERSION_UNSUPPORTED` or `SCHEMA_INVALID`.
 */
export interface SchemaLoader {
  load(request: SchemaLoadRequest): Promise<OpenAPI3>;
}
