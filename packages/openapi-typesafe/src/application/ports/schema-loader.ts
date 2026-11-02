import type { OpenAPI3, SchemaSource } from "../../types.js";

export interface SchemaLoadRequest {
  readonly source: SchemaSource;
  /** The base for relative `$ref`s of a source that is not a URL (a directory URL). */
  readonly cwd: URL;
  /** Lint with the Redocly config before bundling; off with the `lint: false` option. */
  readonly shouldLint: boolean;
}

/**
 * Read, validate and bundle an OpenAPI 3 document into one document (ENGINEERING_PLAN 4.5).
 * Fails with a typed error (ADR-011): `SCHEMA_SOURCE_*`, `SCHEMA_LOAD_FAILED`,
 * `SCHEMA_PARSE_FAILED`, `SCHEMA_VERSION_UNSUPPORTED`, `SCHEMA_INVALID`, `SCHEMA_REF_INVALID`,
 * `SCHEMA_TOO_DEEP` or `SCHEMA_KEY_UNSUPPORTED`.
 */
export interface SchemaLoader {
  load(request: SchemaLoadRequest): Promise<OpenAPI3>;
}
