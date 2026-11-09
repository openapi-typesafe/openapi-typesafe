import { irKeyword } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import { createRef } from "../../../domain/openapi/json-pointer.js";
import {
  type ParameterObject,
  QUERYSTRING_LOCATION,
} from "../../../domain/openapi/parameter-object.js";
import { FIX } from "../../../domain/output-fixes.js";
import type { SchemaContext, SchemaLocation } from "../schema/schema-context.js";
import { transformSchema } from "../schema/schema-transform.js";
import { contentEntryType } from "./media-type.js";

/**
 * A parameter typed by the schema of its one `content` media type. An `in: querystring` parameter
 * (OpenAPI 3.2) is the whole query string (ADR-020); without a media type it is `string`, the
 * query string as text. With the `parameter-content` fix, any other parameter with `content`
 * (OpenAPI 3.0 and later, for a JSON value in a query parameter) is typed the same way.
 */
function contentParameterType(
  parameter: ParameterObject,
  location: SchemaLocation,
  context: SchemaContext,
): IrType {
  const [mediaType, entry] = Object.entries(parameter.content ?? {})[0] ?? [];
  if (mediaType === undefined || entry === undefined) {
    return irKeyword("string");
  }
  const path = createRef([location.path, "content", mediaType]);
  return contentEntryType(entry, { ...location, path }, context);
}

function isTypedByContent(parameter: ParameterObject, context: SchemaContext): boolean {
  if (parameter.in === QUERYSTRING_LOCATION) {
    return true;
  }
  const hasContent = parameter.schema === undefined && parameter.content !== undefined;
  return hasContent && context.options.fixes.has(FIX.PARAMETER_CONTENT);
}

/**
 * A parameter's type (OpenAPI 3.2 §4.8.12). Without a schema it is `string`, not `unknown`:
 * query, path, header and cookie values all arrive as text. `content` is read for
 * `in: querystring`, and with the `parameter-content` fix for every parameter; without the fix
 * other parameters with `content` keep the original's `string`.
 */
export function parameterType(
  parameter: ParameterObject,
  location: SchemaLocation,
  context: SchemaContext,
): IrType {
  if (isTypedByContent(parameter, context)) {
    return contentParameterType(parameter, location, context);
  }
  return parameter.schema
    ? transformSchema(parameter.schema, location, context)
    : irKeyword("string");
}
