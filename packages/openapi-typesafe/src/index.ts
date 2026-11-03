import openapiTS from "./api/openapi-ts.js";

/**
 * The package entry: the public Node API (ENGINEERING_PLAN 4.1, `api/`). `openapiTS` is the default
 * export, as in the original.
 */

export * from "./api/ast-to-string.js";
export { COMMENT_HEADER } from "./api/comment-header.js";
export { scanDiscriminators } from "./api/discriminator-scan.js";
export type { FooterEntry } from "./api/footer-entry.js";
export * from "./api/legacy-ts-helpers.js";
export * from "./api/legacy-utils.js";
export * from "./api/string-to-ast.js";
export { default as transformSchema } from "./api/transform-schema.js";
export {
  BOOLEAN,
  FALSE,
  NEVER,
  NULL,
  NUMBER,
  type OapiRefOptions,
  oapiRef,
  STRING,
  TRUE,
  type TypeInput,
  tsIntersection,
  tsLiteral,
  tsNullable,
  tsOmit,
  tsRecord,
  tsUnion,
  tsWithRequired,
  UNDEFINED,
  UNKNOWN,
} from "./api/type-helpers.js";
export {
  ERROR_CODES,
  type ErrorCode,
  type ErrorDetails,
  isOpenAPITypesafeError,
  OpenAPITypesafeError,
} from "./domain/errors.js";
export type * from "./domain/ir/nodes.js";
export {
  ALL_OUTPUT_FIXES,
  OUTPUT_FIXES,
  OutputFix,
  type OutputFixName,
} from "./domain/output-fixes.js";
export { default as transformComponentsObject } from "./transform/components-object.js";
export { default as transformHeaderObject } from "./transform/header-object.js";
export { default as transformMediaTypeObject } from "./transform/media-type-object.js";
export * from "./transform/operation-object.js";
export { default as transformOperationObject } from "./transform/operation-object.js";
export { default as transformParameterObject } from "./transform/parameter-object.js";
export * from "./transform/path-item-object.js";
export { default as transformPathItemObject } from "./transform/path-item-object.js";
export { default as transformPathsObject } from "./transform/paths-object.js";
export { default as transformRequestBodyObject } from "./transform/request-body-object.js";
export { default as transformResponseObject } from "./transform/response-object.js";
export { default as transformResponsesObject } from "./transform/responses-object.js";
export * from "./transform/schema-object.js";
export { default as transformSchemaObject } from "./transform/schema-object.js";
export * from "./types.js";

export default openapiTS;
