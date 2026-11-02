import { irKeyword } from "../../../domain/ir/constructors.js";
import type { IrType } from "../../../domain/ir/nodes.js";
import type { ParameterObject } from "../../../domain/openapi/parameter-object.js";
import type { SchemaContext, SchemaLocation } from "../schema/schema-context.js";
import { transformSchema } from "../schema/schema-transform.js";

/**
 * A parameter's type (OpenAPI 3.1 §4.8.12). Without a schema it is `string`, not `unknown`:
 * query, path, header and cookie values all arrive as text.
 */
export function parameterType(
  parameter: ParameterObject,
  location: SchemaLocation,
  context: SchemaContext,
): IrType {
  return parameter.schema
    ? transformSchema(parameter.schema, location, context)
    : irKeyword("string");
}
