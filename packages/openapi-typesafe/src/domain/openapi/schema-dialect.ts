/**
 * The schema dialect of a document. OpenAPI 3.0 Schema Objects ignore every keyword next to a
 * `$ref` (OpenAPI 3.0.3, Reference Object). OpenAPI 3.1 and 3.2 use JSON Schema 2020-12, where a
 * `$ref` is one keyword among the others, and all of them apply (JSON Schema Core §8.2.3.1).
 */
export const SCHEMA_DIALECTS = {
  OPENAPI_3_0: "openapi-3.0",
  JSON_SCHEMA_2020_12: "json-schema-2020-12",
} as const;

export type SchemaDialect = (typeof SCHEMA_DIALECTS)[keyof typeof SCHEMA_DIALECTS];

const OPENAPI_3_0_RE = /^3\.0(?:\.|$)/;

/**
 * The dialect of a document's `openapi` version. Without a version (a schema passed to a
 * transformer on its own) it is OpenAPI 3.0, which keeps the output the original gives.
 */
export function schemaDialectOf(openapiVersion: unknown): SchemaDialect {
  const isOpenApi30 = typeof openapiVersion !== "string" || OPENAPI_3_0_RE.test(openapiVersion);
  return isOpenApi30 ? SCHEMA_DIALECTS.OPENAPI_3_0 : SCHEMA_DIALECTS.JSON_SCHEMA_2020_12;
}
