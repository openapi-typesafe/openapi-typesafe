import type { IrType } from "../../../domain/ir/nodes.js";
import type { MediaTypeObject } from "../../../domain/openapi/media-type-object.js";
import type { SchemaContext, SchemaLocation } from "../schema/schema-context.js";
import { transformSchema } from "../schema/schema-transform.js";
import { UNKNOWN_TYPE } from "../shared-types.js";

/** A media type's schema, or `unknown` when it has none (OpenAPI 3.1 §4.8.14). */
export function mediaTypeType(
  mediaType: MediaTypeObject,
  location: SchemaLocation,
  context: SchemaContext,
): IrType {
  return mediaType.schema ? transformSchema(mediaType.schema, location, context) : UNKNOWN_TYPE;
}
