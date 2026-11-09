import type { OpenAPI3, SchemaSource } from "../../types.js";

/**
 * Where `$ref` documents may be loaded from (threat model R1 and R2, ADR-017). An unset limit
 * allows everything, as in openapi-typescript; the root document is never limited.
 */
export interface RefAccess {
  /** Local `$ref` files must be in this directory or below it (a `file:` URL). */
  readonly localRoot?: URL;
  /** Remote `$ref` documents must come from these hosts (`name` or `name:port`); `[]`: none. */
  readonly remoteHosts?: readonly string[];
}

export interface SchemaLoadRequest {
  readonly source: SchemaSource;
  /** The base for relative `$ref`s of a source that is not a URL (a directory URL). */
  readonly cwd: URL;
  /** Lint with the Redocly config before bundling; off with the `lint: false` option. */
  readonly shouldLint: boolean;
  readonly refAccess: RefAccess;
}

/** A bundled document, and the local files read to build it. */
export interface LoadedSchema {
  readonly document: OpenAPI3;
  /**
   * The root, when it is a local file, and every local file a `$ref` loaded. The CLI keeps its
   * output from replacing any of them (`CLI_OUTPUT_IS_INPUT`).
   */
  readonly localFiles: readonly URL[];
}

/**
 * Read, validate and bundle an OpenAPI 3 document into one document (ENGINEERING_PLAN 4.5).
 * Fails with a typed error (ADR-011): `SCHEMA_SOURCE_*`, `SCHEMA_LOAD_FAILED`,
 * `SCHEMA_REF_FORBIDDEN`,
 * `SCHEMA_PARSE_FAILED`, `SCHEMA_VERSION_UNSUPPORTED`, `SCHEMA_INVALID`, `SCHEMA_REF_INVALID`,
 * `SCHEMA_TOO_DEEP` or `SCHEMA_KEY_UNSUPPORTED`.
 */
export interface SchemaLoader {
  load(request: SchemaLoadRequest): Promise<LoadedSchema>;
}
