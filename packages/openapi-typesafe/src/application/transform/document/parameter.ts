import { irKeyword } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import { createRef } from "../../../domain/openapi/json-pointer.js";
import {
  type ParameterObject,
  QUERYSTRING_LOCATION,
} from "../../../domain/openapi/parameter-object.js";
import type { SchemaContext, SchemaLocation } from "../schema/schema-context.js";
import { transformSchema } from "../schema/schema-transform.js";
import { contentEntryType } from "./media-type.js";

/**
 * An `in: querystring` parameter (OpenAPI 3.2): the whole query string, typed by the schema of its
 * one `content` media type (ADR-020). Without one it is `string`, the query string as text.
 */
function querystringType(
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

/**
 * A parameter's type (OpenAPI 3.2 §4.8.12). Without a schema it is `string`, not `unknown`:
 * query, path, header and cookie values all arrive as text. `content` is read only for
 * `in: querystring`; other parameters with `content` keep their pre-3.2 type.
 */
export function parameterType(
  parameter: ParameterObject,
  location: SchemaLocation,
  context: SchemaContext,
): IrType {
  if (parameter.in === QUERYSTRING_LOCATION) {
    return querystringType(parameter, location, context);
  }
  return parameter.schema
    ? transformSchema(parameter.schema, location, context)
    : irKeyword("string");
}
